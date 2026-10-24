"""Generate a reproducible Chinese LaTeX report from actual, sanitized playtest evidence."""
from pathlib import Path
import json, csv, shutil, statistics, collections, sys
sys.path.append(str(Path(__file__).resolve().parents[2] / 'build/report-packages'))
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'build/playtest'
OUT = ROOT / 'output/pdf/gameplay-report'
FIG = OUT / 'figures'
DATA = OUT / 'data'
for p in [OUT, FIG, DATA]: p.mkdir(parents=True, exist_ok=True)
game = json.loads((SRC/'campaign.json').read_text(encoding='utf-8'))
sweep = json.loads((SRC/'sweep.json').read_text(encoding='utf-8'))
assert len(game['turns']) == 10 and game['final']['ended'], 'The report requires a completed campaign.'
for name in ['campaign.json','sweep.json','attempt-1.json','attempt-2.json','ai-smoke-results.json','ai-ui-results.json','ai-usage.jsonl','attempt-2-usage.jsonl','ai-smoke.jsonl','ai-ui-usage.jsonl']:
    if (SRC/name).exists(): shutil.copy2(SRC/name, DATA/name)
for p in (SRC/'screens').glob('*.png'): shutil.copy2(p, FIG/p.name)
shutil.copy2(ROOT/'docs/Gameplay.md', DATA/'Gameplay.md')

names = ['Marshal','Envoy','Builder','Steward','Scholar']
roles = ['军事','外交','工业','民生','科技']
colors = ['#bc304d','#329e78','#3d8fb6','#b18b22','#ad6493']
states = [game['initial']] + [t['after'] for t in game['turns']]
final = states[-1]
total = lambda n: sum(n['score'].values())
lands = lambda s,i: sum(r['owner']==i for r in s['regions'])
resources = ['treasury','food','energy','industry','research','army','population']
rows=[]
for turn,s in enumerate(states):
    for i,n in enumerate(s['nations']):
        rows.append({'turn':turn,'nation':i,'role':names[i],**n['resources'],'land':lands(s,i),'stability':n['stability'],'fatigue':n['fatigue'],'trust':n['trust'],**{f'tech_{k}':v for k,v in n['tech'].items()},**{f'score_{k}':v for k,v in n['score'].items()},'score_total':total(n)})
with (DATA/'nation-turns.csv').open('w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
events=[{'turn':t['turn'],**e} for t in game['turns'] for e in t['after']['report']['events']]
battles=[{'turn':t['turn'],**b} for t in game['turns'] for b in t['after']['report']['battles']]
(DATA/'events.json').write_text(json.dumps(events,ensure_ascii=False,indent=2),encoding='utf-8')
(DATA/'battles.json').write_text(json.dumps(battles,ensure_ascii=False,indent=2),encoding='utf-8')
calls=[]
for label,record in [('完整对局',game),('中断尝试1',json.loads((SRC/'attempt-1.json').read_text(encoding='utf-8'))),('中断尝试2',json.loads((SRC/'attempt-2.json').read_text(encoding='utf-8')))]:
    for a in record['ai']: calls.append({'source':label,'mode':a['mode'],**a['result']['usage']})
smoke=json.loads((SRC/'ai-smoke-results.json').read_text(encoding='utf-8'))
# Smoke output is a named object with treaty/orders responses.
for key,val in (smoke.items() if isinstance(smoke,dict) else enumerate(smoke)):
    if isinstance(val,dict) and 'result' in val: val=val['result']
    if isinstance(val,dict) and 'usage' in val: calls.append({'source':'接口冒烟','mode':str(key),**val['usage']})
ui=json.loads((SRC/'ai-ui-results.json').read_text(encoding='utf-8'))
assert not ui['errors'] and len(ui['checks'])==3
for a in ui['calls']: calls.append({'source':'AI界面','mode':a['mode'],**a['result']['usage']})
(DATA/'ai-costs.json').write_text(json.dumps(calls,ensure_ascii=False,indent=2),encoding='utf-8')
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':9,'axes.spines.top':False,'axes.spines.right':False,'axes.labelcolor':'#373b43','axes.edgecolor':'#c3c6cc','grid.alpha':.18,'figure.facecolor':'white','savefig.facecolor':'white','axes.titleweight':'bold'})
def finish(fig,name):
    fig.savefig(FIG/f'{name}.pdf',bbox_inches='tight');fig.savefig(FIG/f'{name}.png',dpi=150,bbox_inches='tight');plt.close(fig)
def series(ax,get,title):
    for i in range(5): ax.plot(range(11),[get(s,i) for s in states],label=names[i],color=colors[i],lw=1.8,marker='o',ms=2.5)
    ax.set(title=title,xlabel='Completed settlements',xticks=range(0,11,2));ax.grid(True)
fig,axs=plt.subplots(2,2,figsize=(9,6.2))
for ax,get,title in [(axs[0,0],lambda s,i:total(s['nations'][i]),'Total score (opening display = 0)'),(axs[0,1],lambda s,i:lands(s,i),'Controlled regions'),(axs[1,0],lambda s,i:s['nations'][i]['resources']['army'],'Army strength'),(axs[1,1],lambda s,i:s['nations'][i]['trust'],'Global trust')]: series(ax,get,title)
fig.legend(names,loc='lower center',ncol=5,frameon=False);fig.tight_layout(rect=(0,.05,1,1));finish(fig,'trajectories')
fig,axs=plt.subplots(4,2,figsize=(9,9))
for ax,key in zip(axs.flat,resources): series(ax,lambda s,i,k=key:s['nations'][i]['resources'][k],key.title())
series(axs.flat[-1],lambda s,i:s['nations'][i]['stability'],'Stability (%)')
fig.legend(names,loc='lower center',ncol=5,frameon=False);fig.tight_layout(rect=(0,.03,1,1));finish(fig,'resources')
fig,axs=plt.subplots(1,2,figsize=(9,3.5));bottom=np.zeros(5)
for k,c in zip(['military','economy','technology','diplomacy'],['#c13951','#667785','#c5a343','#7ca698']):
    v=[n['score'][k] for n in final['nations']];axs[0].bar(names,v,bottom=bottom,label=k,color=c);bottom+=v
axs[0].set(title='Final score composition',ylim=(0,400));axs[0].legend(frameon=False,fontsize=8);axs[0].tick_params(axis='x',rotation=25)
for i in range(5): axs[1].plot(range(1,11),[sum(e.get('amount',0) for e in t['after']['report']['events'] if e['code']=='auto-recruit' and e['nation']==i) for t in game['turns']],label=names[i],color=colors[i],marker='o',ms=3)
axs[1].set(title='Automatic recruitment / settlement',xlabel='Settlement',ylabel='New strength');axs[1].grid(True);fig.tight_layout();finish(fig,'score-recruits')
fig,axs=plt.subplots(1,2,figsize=(9,3.4));x=np.arange(5)
for off,key,label,c in [(-.25,'income','Income','#378765'),(0,'spending','Actions + programs','#bd4058'),(.25,'upkeep','Upkeep','#6b7785')]:
    v=[sum(t['after']['report']['ledger'][i][key]['treasury'] for t in game['turns']) for i in range(5)]
    axs[0].bar(x+off,v,width=.25,label=label,color=c)
axs[0].set(xticks=x,xticklabels=names,title='Treasury flows over ten turns');axs[0].tick_params(axis='x',rotation=25);axs[0].legend(fontsize=7,frameon=False)
funds=np.array([[sum(e.get('amount',0) for e in events if e['code']=='program-funded' and e['nation']==i and e.get('reason')==k) for k in ['political','economy','society','technology','diplomacy']] for i in range(5)])
im=axs[1].imshow(funds,cmap='Reds',aspect='auto');axs[1].set(xticks=range(5),xticklabels=['Gov.','Industry','Society','Science','Diplomacy'],yticks=range(5),yticklabels=names,title='Actually funded program budgets')
for i in range(5):
    for j in range(5): axs[1].text(j,i,str(funds[i,j]),ha='center',va='center',color='white' if funds[i,j]>funds.max()*.6 else '#222')
axs[1].tick_params(axis='x',rotation=25);fig.tight_layout();finish(fig,'finance')
gains=collections.defaultdict(list)
for g in sweep['games']:
    for i,role in enumerate(g['roles']): gains[role].append(total(g['states'][-1]['nations'][i])-total(g['states'][0]['nations'][i]))
rolekeys=['military','diplomacy','industry','society','technology']
fig,axs=plt.subplots(1,2,figsize=(9,3.5));axs[0].boxplot([gains[k] for k in rolekeys],tick_labels=names,patch_artist=True,boxprops={'facecolor':'#e2e5e9'},medianprops={'color':'#b72244'});axs[0].set(title='Peaceful sweep: score gain T1 to T10',ylabel='Score increase');axs[0].tick_params(axis='x',rotation=25)
matrix=np.array([[next(v['recruits'] for v in sweep['sensitivity'] if v['mode']==m and v['budget']==b) for b in [0,10,20,40,80]] for m in ['off','reserve','expansion','emergency']]);axs[1].imshow(matrix,cmap='Reds');axs[1].set(title='One-turn recruits by mode / budget',xticks=range(5),xticklabels=[0,10,20,40,80],yticks=range(4),yticklabels=['Off','Reserve','Expansion','Emergency'],xlabel='Recruitment budget')
for i in range(4):
    for j in range(5): axs[1].text(j,i,str(matrix[i,j]),ha='center',va='center',color='white' if matrix[i,j]>matrix.max()*.6 else '#222')
fig.tight_layout();finish(fig,'sweep')
fig,axs=plt.subplots(1,2,figsize=(9,3.2));axs[0].bar(range(1,11),[t['settlementUiMs']/1000 for t in game['turns']],color='#b83a54');axs[0].set(title='Five-tab visible settlement latency',xlabel='Turn',ylabel='Seconds')
axs[1].scatter([c['input'] for c in calls],[c['output'] for c in calls],s=[max(25,c['usd']*5000) for c in calls],color='#557c91',alpha=.65);axs[1].set(title='Real API calls: token usage',xlabel='Input tokens',ylabel='Output tokens');fig.tight_layout();finish(fig,'latency')

def esc(x):
    replacements={'\\':r'\textbackslash{}','&':r'\&','%':r'\%','$':r'\$','#':r'\#','_':r'\_','{':r'\{','}':r'\}'}
    return ''.join(replacements.get(c,c) for c in str(x))
def table(headers,body,widths=None):
    spec=widths or ('l'+'r'*(len(headers)-1))
    return '\\begin{center}\\small\\begin{tabular}{'+spec+'}\\toprule\n'+' & '.join(map(esc,headers))+r'\\\midrule'+'\n'+'\n'.join(' & '.join(map(esc,r))+r'\\' for r in body)+'\n\\bottomrule\\end{tabular}\\end{center}\n'
def pic(name,width='.98',height=None):
    opts=f'width={width}\\linewidth'+(f',height={height}\\textheight,keepaspectratio' if height else '')
    return '\\begin{center}\\includegraphics['+opts+']{figures/'+name+'}\\end{center}\n'
parts=[]
def page(title,body): parts.append('\\clearpage\n\\section{'+title+'}\n'+body)
summary={'turns':10,'tests':56,'sweep_settlements':250,'battles':len(battles),'calls':len(calls),'cost':sum(c['usd'] for c in calls),'scores':[total(n) for n in final['nations']],'events':dict(collections.Counter(e['code'] for e in events)),'ui_median_ms':statistics.median(t['settlementUiMs'] for t in game['turns'])}
(DATA/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
winner=max(range(5),key=lambda i:total(final['nations'][i]))
preamble=r'''% !TeX program = xelatex
\documentclass[UTF8,fontset=fandol,11pt,a4paper]{ctexart}
\usepackage[margin=20mm,headheight=15pt]{geometry}
\usepackage{graphicx,booktabs,longtable,amsmath,amssymb,xcolor,hyperref,fancyhdr,array}
\definecolor{accent}{HTML}{B82C49}
\hypersetup{colorlinks=true,linkcolor=accent,urlcolor=accent,pdftitle={SOVEREIGN v0.5 玩法与实测报告},pdfauthor={Codex}}
\setlength{\parindent}{0pt}\setlength{\parskip}{6pt}
\renewcommand{\arraystretch}{1.22}
\pagestyle{fancy}\fancyhf{}\fancyhead[L]{\small SOVEREIGN / SYSTEMS LAB}\fancyhead[R]{\small v0.5 · 2026.10.22}\fancyfoot[R]{\thepage}\fancyfoot[L]{\small 本地原型 · 可复核实验}
\ctexset{section={format=\Large\bfseries\color{accent}},subsection={format=\large\bfseries}}
\newcommand{\note}[1]{\par\begingroup\color{gray}\small #1\par\endgroup}
\begin{document}
\thispagestyle{empty}
{\small\bfseries SOVEREIGN\hfill PLAYTEST / 005}\par
\vspace{16mm}
{\Huge\bfseries 自动动员与\par 条件外交}\par
\vspace{5mm}{\Large 玩法、数学规则与五人对局实测报告}\par
\vspace{4mm}{\color{accent}\rule{\linewidth}{1.3pt}}
'''
parts.append(preamble+rf'''\textbf{{交付范围}}：持续自动征兵、五类国政预算、组合条约、条件退出、还价、撕约信誉、真实 AI 结构化草案，以及十回合五标签试玩。

实际对局由五个独立游客标签完成；AI 负责开局解释，后续使用五套可复现策略控制器。战斗与经济均由 C++ 规则结算。完整保存每回合状态、指令、条约、截图和用量。
'''+table(['检验','结果'],[['规则/联机测试','56 / 56 通过'],['真实五标签对局','10 回合；完成最终计分'],['和平对照','25 局 / 250 次结算'],['动员敏感性','20 个组合'],['真实 API 调用',f"{len(calls)} 次；估算 ${summary['cost']:.4f}"],['独立争夺战斗',len(battles)]],'lr')+rf'''
\textbf{{主要观察}}：本局 {roles[winner]}路线最终得分 {summary['scores'][winner]}，排名第一。不同路线的财务、军力与科研轨迹已产生明显差异；这是一组系统联调结果，不能据此断言竞技平衡。

\textbf{{证据边界}}：完整浏览器局只有一局；和平对照没有敌对互动；模型只参与开局六次解释，并非十回合自主 AI 玩家。真实邮件投递、物理跨设备、公网部署未在本次验证。
\vfill
{{\small 测试日期：2026 年 10 月 22 日（America/New\_York）\\
文档来源：本地最终代码、原始试验输出与实际界面截图。\\
成本为 API 返回 token 用量的估价，不等同于服务商账单。}}
''')
page('实现范围与玩家回合',r'''
\subsection{持续意图与即时命令}
自然语言国策继续作为长期偏好；本回合明确指令优先。现在另有可直接执行、跨回合保存的五项国政预算和动员配置。仅写一段意识形态文字不会自动覆盖资源分配；玩家必须审阅并应用结构化行动。这样保留自然语言入口，也让每一笔资源消耗可解释。
\begin{enumerate}
\item 在自己的标签中查看世界、资源、战报，调整持续政策或本回合队列。
\item 外交可直接编辑条款，也可让 LLM 翻译提案。对方接受、拒绝或还价；旧记录保留。
\item 五名玩家各自确认，房主统一结算；任何相关更改会撤销确认。
\item 阅读实际支出、征募、战斗和外交事件。配置持续生效，无须每回合重复征兵。
\item 至少一次结算后，房主可结束对局并按四项总分排名。没有强制时间限制。
\end{enumerate}
\subsection{结算顺序就是规则的一部分}
双签条约激活、条件终止 $\rightarrow$ 手动指令付费与移动 $\rightarrow$ 持续国政 $\rightarrow$ 自动征兵 $\rightarrow$ 同时战斗 $\rightarrow$ 收入与维护 $\rightarrow$ 协议支付 $\rightarrow$ 得分与战报。

手动行动先花钱，国政其次，征兵最后；新产出的科研不能倒流支付此前的研究。协议付款使用维护后的库存，避免把尚未赚到的钱预先承诺成可用资金。
\subsection{本次新增的可玩机制}
四档动员、目标军力、费用上限、补员地区；治理/工业/民生/科研/外交五类预算；多条款、不等量、延迟和周期支付；第三国进攻触发结束；还价生成新版本；主动撕约与付款违约的不同信誉惩罚；AI 草案审阅和持久预算保护。

仍保留单次征兵、移动、撤退、固守、进攻、投资、三条科技线和六种限时法令。没有添加未经规则支持的任意自然语言效果。
''')
page('资源账本与持续国政',r'''
$C,F,E,I,R,A,P$ 分别为国库、粮食、能源、工业、科研、军力、平民人口；$L$ 为控制地区数，$p,m,l$ 为生产、军事、后勤等级。$S,W,T\in[0,100]$ 为稳定、厌战、全球信誉。资源为整数并限制在 $[0,10^6]$。

基础收入使用回合开始时的工业、稳定和科技；维护使用征募及战斗后的军队、人口。新增工业与科技从下一回合影响产出。
\begin{align*}
C_{in}&=\left\lfloor \left\lfloor(\lfloor I/2\rfloor+3L+5p)(50+S)/150\right\rfloor\alpha\right\rfloor,\\
F_{in}&=8L+5p,\qquad E_{in}=5L+4p,\\
C_{up}&=\lfloor A/(4+l)\rfloor+\lfloor P/10\rfloor,\\
F_{up}&=\lfloor P/8\rfloor+\lfloor A/(6+l)\rfloor,\\
E_{up}&=\lfloor I/(5+l)\rfloor+\lfloor A/12\rfloor,\\
R_{base}&=3+\lfloor I/20\rfloor.
\end{align*}
法令收益/维护另加；无领土则无基础收益。任一维护短缺：稳定减12，各地区兵力乘0.9向下取整；没有短缺则稳定加2。交战另使稳定减4、厌战加12，未交战厌战减6。

五类请求预算 $b_j\in[0,30]$，$B=\sum b_j$，手动付费后可用额度 $V=\max(0,C-20)$：
\[f_j=\begin{cases}b_j&B\le V,\\ \lfloor b_jV/B\rfloor&B>V.\end{cases}\]
舍入余数留存；$B=0$ 时没有开支。每项实际投入 $f$ 的效果如下。
'''+table(['领域','效果'],[['治理','稳定 + floor(f/5)'],['工业','工业 + floor(f/4)'],['民生','粮食 + f；人口 + floor(f/10)；稳定 + floor(f/6)'],['科研','科研 + floor(f/2)'],['外交','全球信誉 + floor(f/10)']],'ll')+r'''
预算按比例缩减避免透支，但小额投入可能被整数取整吞掉；这是试玩时应显式提示的效率阈值。国政和法令并行，分别收费。
\subsection{从实际战报核对一笔账}
第一回合军事国国库：$140-50+42-39-10=83$。其中50为手动科研20、国政15和扩军15；42税收、39维护、10协议付款。粮食：$95-5+72-30+12=144$。每项都能回溯到指令、规则或双方承诺。
''')
page('自动征兵：目标、能力与代价',r'''
玩家设置档位、目标总军力 $G$、每回合征募预算 $B_m\in[0,200]$ 和补员地区。默认常备补员、目标初始军力、预算20；只有军力低于目标才补充。失去指定地区则依次使用本国首都、首个本国地区；灭国后停止。
'''+table(['档位','人口率 r','倍率 k','单位费用 c','税收系数','稳定/厌战'],[['暂停','0','0','—','1','0 / 0'],['常备','2%','1','2','1','0 / 0'],['扩军','5%','2','3','0.95','−1 / +1'],['紧急','10%','3','4','0.85','−4 / +4']],'lrrrrl')+r'''
训练上限 $H=(2+\lfloor I/10\rfloor+2l)k$。$P,I,l$ 使用开局值；$A^*$ 是手动安排后的总军力，$C^*,F^*,P^*$ 是国政付费后的库存。
\begin{align*}
q=\max\{0,\min(&G-A^*,\lceil Pr\rceil,H,\lfloor B_m/c\rfloor,\\
&\lfloor\max(0,C^*-20)/c\rfloor,\max(0,F^*-20),\\
&5\max(0,P^*-20))\}.
\end{align*}
暂停时直接 $q=0$。实际扣费为 $cq$ 国库、$q$ 粮食、$\lceil q/5\rceil$ 人口。至少留下20国库/粮食/人口；这个底线不保证之后的维护也能支付。

仅当 $q>0$ 才应用扩军/紧急动员的税收与稳定代价。新兵本回合能够守城，但不能再次被军令调出。补员发生于战斗之前，本回合战损通常要下一回合才补足。
\subsection{设计意义与当前缺口}
无需连续点击征兵，仍然要决定和平常备、扩军威慑或战时应急。更高档位提高容量，却更贵且压低税收；人口、粮食和工业都会制约结果。

目前人口同时充当平民与征募来源，尚无独立预备役池；和平时厌战自然恢复会抵消部分动员增量。这些是明确的平衡假设，不是现实军事经济模型。
''')
page('投资、科技、法令与战斗',r'''
\subsection{行动成本}
工业投资 $x$ 花国库 $x$，增工业 $\lfloor x/4\rfloor$；粮食/能源投资一比一；科研投资增 $\lfloor x/2\rfloor$。研究下一级花科研 $30(\text{等级}+1)$ 和国库15，最高三级，效果下回合生效。每条科技线每回合最多升一级。

单次征兵 $x$ 花国库 $2x$、粮食 $x$、人口 $\lceil x/5\rceil$。调动/撤退/进攻消耗能源 $\lceil x/10\rceil$，只跨一个邻接或固定海路。每来源地区只可下达一条军令；数量受开局驻军限制。

六种法令花国库20、持续三次结算：政治稳定+6/国库维护+5；军事战力乘1.1/粮食维护+5；外交信誉+4；经济工业+6；社会粮食+20/稳定+3；科技科研+10/能源维护+5。取消免费且当回合停止。
\subsection{同时战争}
同一目的地各国独立竞争，战力为
\[Q=A(1+0.15m)\,d\,s\,(1-0.003W)\,h\,g\,e.\]
防守地形 $d$：山地1.4，高原/河流1.2，其他1.1；进攻为1。开局粮食或能源为0时补给 $s=0.65$，否则1。渡海 $h=0.8+0.05l$，陆地1。固守 $g=1.15$，否则1；军事法令 $e=1.1$，否则1。

最高战力方获胜，同值优先原守方、再按固定编号。设胜方倍率为 $f_w$：
\[A'_w=\max\{1,A_w-\lceil 0.55\sum_{j\ne w}Q_j/f_w\rceil\}.\]
败方 $\lfloor0.4A_j\rfloor$ 撤至仍为本国的首个相邻陆地，无退路则全损。双方可能交换无人防守土地，没有半路拦截。混合陆海同国部队暂整体承担海路惩罚。

首都只用于地图标记与补员优先；全失领土后不能行动且得分归零。战斗无随机骰子，因此相同输入可精确重放。
''')
page('外交：文字如何变成可执行承诺',r'''
协议持续1--5回合，最多8条条款。LLM 只将原文映射到白名单，最终以双方审阅的结构化条款为准，原文不是隐藏规则。
\begin{enumerate}
\item \textbf{资源支付}：签约方向另一方支付国库/粮食/能源，每条1--100；允许单向、多资源、不等量。起始结算 $s$、周期 $e$；协议年龄 $a$ 满足 $a\ge s$ 且 $(a-s)\bmod e=0$ 时支付。
\item \textbf{互不侵犯}：双方不能互攻，也不能同时争夺同一目的地。先合法终止或明确撕约才能绕过约束。
\item \textbf{进攻触发终止}：指定签约方向指定国家控制区下达进攻，整个协议在战斗前终止。依据开局控制权，不要求打赢，也不扣信誉，因为这是双方提前认可的退出条件。
\end{enumerate}
\subsection{付款采用原子履约}
每份协议、每种资源汇总各方应付总额，用维护后的自身库存支付；不能依赖同一协议的预期收款垫付。全部够钱才整体转移，否则一笔也不转，协议标为违约；每个实际无力付款方信誉减8。多个协议依次清算，尚无跨协议统一净额结算。
\subsection{可追踪的谈判历史}
提案方签署 $\rightarrow$ 对方接受 $\rightarrow$ 下一次结算激活；或被拒绝/撤回，记录一直保留。收件方可还价，旧提案成为 superseded，新编号只带还价方签名，必须重新接受。

有效协议可以主动撕毁：立即信誉减15，标为 broken、记录操作人和回合、撤销相关确认，并在战报广播。同份协议不会重复扣分。约定条件退出是 terminated，付款失败是 breached，正常期满是 expired。

全球信誉是公开的一个国家指标，影响外交得分和真人判断。尚未自动改变贸易报价，也不会强迫其他玩家拒绝合作。当前界面新建 compact；历史旧等量 trade 仍保留原来缺款跳过的兼容规则。
''')
page('AI 接口、权力边界与实际成本',r'''
服务端调用 Responses API，模型 gpt-6.1-sol，严格 JSON Schema；最多4000输出 token、55秒超时。只提供公开世界与请求者本国计划，不传他国草稿。条约不得强加第三方付款；军令仍经原生规则验证。

输出先显示解释、条款/指令及未支持项。出现歧义或未支持要求时整份草案不可应用。玩家显式采用后才写入队列，最后仍需正常确认。旧回合或旧草稿版本的结果不能覆盖新决定。

每次请求先写入0.30美元保守预留；收到有效用量后替换为估价。失败或未知用量保留预留。默认每房间1美元、项目最多10美元，达到上限仍可手动操作。费用日志在房间数据旁持久化。

\[\widehat{\$}=\frac{2(N_{in}-N_{cache})+0.10N_{cache}+10N_{out}}{10^6}.\]
'''+table(['来源','调用数','输入 token','输出 token','估算美元'],[[label,sum(c['source']==label for c in calls),sum(c['input'] for c in calls if c['source']==label),sum(c['output'] for c in calls if c['source']==label),f"{sum(c['usd'] for c in calls if c['source']==label):.5f}"] for label in ['接口冒烟','中断尝试1','中断尝试2','完整对局','AI界面']])+rf'''
共 {len(calls)} 次已记录成功调用，估价 \${summary['cost']:.5f}。包含中断测试里的真实调用，不能只报最终一局的费用。失败预留是本地额度控制，不代表提供方实际扣款。
'''+r'''
官方依据：\href{https://developers.openai.com/api/docs/guides/structured-outputs}{Structured Outputs}；\href{https://developers.openai.com/api/docs/models/gpt-6.1-sol}{模型页面}；\href{https://developers.openai.com/api/docs/pricing.md}{标准 token 价格}。价格以测试时核验为准，项目代码按这些价格估算。

这次验证了短文本到有限动作/条约的解释；没有证明模型对所有复杂措辞都忠实。尤其条件的主体、目标、整份协议或单条终止，需要继续建立歧义样本集。
''')
page('实验协议与五种路线',r'''
浏览器使用 Edge、同一浏览器上下文下五个独立游客标签，各持自己的会话、国策和席位。隔离服务端口5184，临时存档；不重置已有用户房间。初始地图为 Five Frontiers；每回合各标签确认，房主用实际按钮结算，十次后结束计分。

AI 解释一份中文条件贸易协议以及五个开局行动，后续行动由确定的控制脚本制定。因此这是五客户端端到端测试，不是五个人类或五个自主大模型的策略竞赛。
'''+table(['角色','治理','工业','民生','科研','外交','动员预算'],[[roles[i],*[game['personas'][i]['standing']['programs'][k] for k in ['political','economy','society','technology','diplomacy']],game['personas'][i]['standing']['mobilization']['budget']] for i in range(5)])+table(['角色','初始地区','国库','工业','军力','人口'],[[roles[i],lands(states[0],i),*[states[0]['nations'][i]['resources'][k] for k in ['treasury','industry','army','population']]] for i in range(5)])+r'''
军事路线扩军并集结边境，第四回合后寻找有优势的进攻；外交路线提高信誉、维持交换；工业路线投入工业与经济法令；民生路线投入粮食/人口/稳定；科技路线优先研究升级。各角色预算不相等，代表不同意图而非公平成本控制。

第4回合主动撕毁军事国与工业国的互不侵犯协议；第5回合刷新工业国标签验证恢复；第6回合外交与民生建立新协议；第7回合工业国的高价提案被拒绝，记录应留存。

额外和平对照：五地图、五次角色轮换、各十回合，每个角色在每张地图都占过每个国家；共25局250次原生结算。只用于发展曲线检查，不能衡量战争收益或完整外交强度。
''')
page('实际界面：持续国政与地图',pic('04-programs.png',height='.78')+r'''
五个玩家标签中的民生路线。右侧五项持续预算集中在模块里；左侧地图显示领地颜色、国名、驻军与实际资源。默认桌面视口1540×1100，长控制面板内部滚动，底部确认按钮固定在面板区域。
\note{截图为自动化浏览器实际渲染。浏览器启用减少动画，避免截图在转场中取样；这不代表移除了日常 Anime.js 动画。}
''')
page('实际界面：条约可审阅与可追溯',pic('02-negotiation.png',height='.76')+r'''
自然语言提案翻译后仍能修改数量、资源、周期和条件对象，再由对方确认。还价建立新版本，旧版本保留；拒绝、撤回和主动撕约也具有独立状态。
\note{完整条款及操作序列见 data/campaign.json；截图只能呈现当时可见的面板部分。}
''')
page('完整对局结果',table(['角色','地区','军力','军事分','经济分','科技分','外交分','总分'],[[roles[i],lands(final,i),final['nations'][i]['resources']['army'],*[final['nations'][i]['score'][k] for k in ['military','economy','technology','diplomacy']],total(final['nations'][i])] for i in range(5)])+pic('trajectories.pdf')+r'''
四项得分上限各100，总分上限400；同分并列。
\begin{align*}
M&=\min(100,4L), & E&=\min(100,\lfloor I/2\rfloor+\lfloor C/20\rfloor),\\
K&=\lfloor100(p+m+l)/9\rfloor, & D&=\min(100,\lfloor T/2\rfloor+12U).
\end{align*}
$U$ 是本回合履约的不同伙伴数。

得分是当前状态，不是逐回合累计。开局界面显示0，到第一次结算才计算；因此图中的第一次跳升不是一回合创造的全部价值。协议到期后伙伴加分消失，外交路线会有明显时点效应。
''')
page('七类资源与稳定：完整时间序列',pic('resources.pdf',height='.83')+r'''
横轴0是开局，1--10是已完成的结算。库存、军队与人口采用实际结果；科研库存下降可能是升级支出，不应直接视为科技退步。所有55个国家时点的完整数值附于 CSV。
''')
page('财政与自动补员的实际取舍',pic('finance.pdf')+pic('score-recruits.pdf')+rf'''
本局发生 {sum(e['code']=='program-reduced' for e in events)} 次国政预算缩减事件。自动征募总量按五国分别为：'''+ '、'.join(f"{roles[i]} {sum(e.get('amount',0) for e in events if e['code']=='auto-recruit' and e['nation']==i)}" for i in range(5))+r'''。

财政柱图分开显示收入、行动/国政/征募支出与维护；未将协议净流入混入收入。资金受限时的实际国政投入见热图，所以配置的预算不能直接当成已经兑现的效果。
''')
page('外交与战争事件复盘',table(['事件','次数'],[[k,sum(e['code']==k for e in events)] for k in ['treaty-payment','treaty-condition','treaty-broken','treaty-default','auto-recruit','program-reduced']],'lr')+table(['终局条约','双方（国家编号）','状态','关闭回合'],[[i+1,f"{t['from']+1} / {t['to']+1}",t['status'],t.get('closedTurn','—')] for i,t in enumerate(final['treaties'])],'llll')+rf'''
十回合共记录 {len(battles)} 个目的地战斗事件。完整交战兵力、胜者、占领与事件原始字段保存在 battles.json。第三国攻击条件是开战前的约定退出；主动撕约则是立即付出信誉代价，两者不应混淆。
'''+r'''
\subsection{实际发生的三场战斗}
第4回合：军事国33兵力进攻地区13，战力36.3，对方17兵力战力21.5；胜后剩22。同期34兵力进攻地区17，对民生国20兵力获胜，剩17。第5回合20兵力进攻地区18，对10兵力获胜，剩13。军事国控制区由9增至12，但最终军力106，仍低于开局120和目标180。

测试把还价、双签、分期支付、主动撕约、拒绝与到期放进一局观察；原子付款失败与信誉只扣一次另有确定性规则测试。如果本局某种事件计数为零，不能把单元测试结果伪装成本局实际发生。

外交目前能创造“帮助谁、以什么为代价、何时退出”的选择，但其开放性仍被有限条款白名单约束。复杂关系无需任意公式：后续可增加可审阅的援助、赔偿、领土租借或担保条款，每类都应先有确定规则与测试。
''')
page('对照实验：成长与动员敏感性',pic('sweep.pdf')+table(['角色','样本','得分增量均值','最小','最大'],[[roles[i],len(gains[k]),f'{statistics.mean(gains[k]):.1f}',min(gains[k]),max(gains[k])] for i,k in enumerate(rolekeys)])+r'''
增量从第一次结算到第十次结算计算，排除开局得分显示为零的跳变。每个角色25个国家样本，但同局国家共享环境，样本并非完全独立；不报告伪精确的统计显著性。

没有战争和条约的对照天然削弱军事/外交价值。此图适合发现资源爆炸、停滞与数值差异，不适合据此直接砍掉弱势路线。动员热图则固定同一初始国家、只改变档位与预算，显示人口/训练容量可能早于预算成为上限。
''')
page('验证覆盖、性能与遇到的问题',pic('latency.pdf')+rf'''
五标签从点击结算到所有页面可见新回合的中位耗时 {summary['ui_median_ms']/1000:.2f} 秒；包含网络、轮询和浏览器渲染，并不是 C++ 纯计算耗时。
'''+r'''
\textbf{通过}：56项自动测试；CMake构建与CTest；前端类型检查及生产构建；五标签两回合回归；五地图×四视口响应式检查；本次十回合五标签；250次和平结算；20组动员组合。另用真实API实际点击两条AI界面流程：军令草案只有明确采用才替换队列，条约翻译只生成可编辑条款、不会自动提案或签署。

\textbf{问题1：旧草稿保护触发。} 第一次脚本从接口写计划后立即点UI确认，页面仍持旧版本，服务端正确拒绝。修复测试脚本：确认前重新读取保存草稿。没有放宽权限或版本保护。

\textbf{问题2：测试期间热更新打断页面等待。} 第二次测试中修改服务端代码触发开发服务器重载；对局已完成第一回合，但“战报标题”等待超时。停止边测边改，并按新回合状态等待，再打开战报。部分数据和API费用保留。

\textbf{问题3：测试断言顺序。} 权限测试原输入先违反第三方条款规则，预期的“非收件人”错误没有到达；修正测试输入后验证真正的授权分支。不是协议权限绕过。

\textbf{构建提示}：Three.js 地图分包约565 kB、gzip约143 kB，超过500 kB提示阈值；构建成功。仍可做加载性能优化，不能视为已解决所有低端设备性能问题。
''')
page('评价与下一轮改进优先级',r'''
\subsection{现在已经成立的核心循环}
持续政策决定国力基础，即时行动表达危机选择，外交把双方承诺变成可观察的资源和信誉后果。自动征兵减少重复操作；条件退出与还价让协议比单一“同盟/贸易”按钮更有表达力。C++ 负责最终结果，LLM 负责理解与提议，能同时保住可解释性和自然语言入口。
\subsection{优先级一：避免玩家不知道为什么}
给动员显示“预计补充多少、是哪项上限卡住”；国政显示取整后的预计收益；提交前列出所有指令合计成本及维护后预计余额。AI 预览使用本地化的动作句子，条件条款突出主体、对象、触发时点。当前已能看战报，但预期反馈还不够。
\subsection{优先级二：让外交产生更长的战略后果}
信誉恢复应有节制；目前外交投入与法令可能较快抵消撕约。考虑衰减式履约历史、双边信任和一次性声誉损伤的恢复速度。先明确设计，再测试，不能偷偷改成模型自由裁决。逐步加入同意后的担保/赔偿/通行等有界条款。
\subsection{优先级三：胜利与资源平衡}
经济库存积累和固定四线求和仍偏向可持续增长；外交伙伴分只看当前回合，结束时机可能影响排名。可比较阶段目标或一段时间平均贡献。军事分主要按土地，技术分按等级，民生只有间接收益；这是否符合用户想要的多线胜利需真人测试。
\subsection{不能忽略控制器自身的偏差}
科技国终局积存161科研却只升了两级，军事实验国积存120科研而科技仍为0。脚本额外要求国库至少55才研究，规则实际只要求15国库和足额科研；它优先保留现金，限制了路线表现。因此科技路线90分不能解释成“科技玩法必败”。工业国即使失去一地仍以180分领先，是值得进一步研究的经济补偿现象。
\subsection{工程限制}
单局完整浏览器测试与有限AI样本不能证明无bug。尚无战争迷雾、多边签署、领土交易、统一金融清算或独立人力池；协议历史有100条上限。服务端仍为Vite开发适配器与JSON存档，静态构建不能直接独立联机。公网部署、实际SMTP和物理设备网络另测；暂不需要SQL迁移。

\textbf{对“人工重启”策略的评价}：把目标、预算和验收证据先讲清，再留出连续实现时间，是有效的协作方式。最有价值的部分是要求真实试玩和数学报告，让“看起来能玩”有机会被数据纠正。
''')
page('最终界面与交付清单',pic('06-final-standings.png',height='.73')+r'''
交付包含本PDF与main.tex；figures中的真实截图及矢量图；data中的每回合CSV、完整状态、计划、外交、战斗、AI用量和中断尝试。详细中文现行规则另在本地 docs/Gameplay.md，按要求由Git忽略。

源码已在工作区更新，没有提交或推送，也没有清除现有用户房间。API配置继续放在服务端.env；报告数据不含登录令牌或API密钥。
''')
parts.append(r'\clearpage\section{附录：逐回合国家数据}\small'+'\n'+r'国库/粮食/能源/工业/科研/军力/人口为结算后值。0为开局；总分开局显示0。\par 完整更多字段见 nation-turns.csv。'+'\n'+r'\begin{longtable}{rr|rrrrrrr|rr}\toprule 回合&国家&C&F&E&I&R&A&P&T&总分\\\midrule\endfirsthead\toprule 回合&国家&C&F&E&I&R&A&P&T&总分\\\midrule\endhead')
for row in rows: parts.append(' & '.join(str(row[k]) for k in ['turn','nation','treasury','food','energy','industry','research','army','population','trust','score_total'])+r'\\'+'\n')
parts.append(r'\bottomrule\end{longtable}\normalsize 国家0军事、1外交、2工业、3民生、4科技。'+'\n')
def case(i,a):
    text=r'\subsection{'+f"{i+1}. {esc(a['mode'])}"+'}\n'+r'\textbf{玩家文本：}'+esc(a['text'])+'\n\n'+r'\textbf{模型解释：}'+esc(a['result']['explanation'])+'\n\n'
    if a['mode']=='treaty':
        text+=table(['类型','主体→对象','资源/数量','开始/周期'],[[c['kind'].replace('cancel_on_attack','进攻终止').replace('transfer','支付'),f"{c['actor']} → {c['target']}",f"{c['resource']} / {c['amount']}" if c['kind']=='transfer' else '整份协议',f"{c['start']} / {c['every']}" if c['kind']=='transfer' else '战斗前'] for c in a['result']['clauses']],'llll')
    else:
        text+=r'\textbf{结构化动作：}'+esc('; '.join(', '.join(f'{k}={v}' for k,v in o.items()) for o in a['result']['orders']))+'\n'
    return text
page('附录：真实 AI 输入与审阅输出','\n'.join(case(i,a) for i,a in enumerate(game['ai'][:3])))
page('附录：其余开局行动解释','\n'.join(case(i+3,a) for i,a in enumerate(game['ai'][3:]))+r'\note{军令字段 from/to 使用零起算地区编号，玩家界面使用一起算。原始严格 JSON 和 token 用量保存在 campaign.json，所有六个最终草案的 unsupported 均为空。}')
parts.append(r'\end{document}')
text='\n'.join(parts)
# Keep long JSON records breakable without changing the retained original JSON evidence.
(OUT/'main.tex').write_text(text,encoding='utf-8')
print(json.dumps(summary,ensure_ascii=True,indent=2))
