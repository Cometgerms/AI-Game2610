import {useEffect,useRef,type ReactNode} from 'react';
/** @requires Explicit close handler. @ensures Focus is trapped by the browser and restored on dismissal. */
export function Modal({title,onClose,children,dismissible=true,className='' }:{title:string;onClose:()=>void;children:ReactNode;dismissible?:boolean;className?:string}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=ref.current!;node.showModal();return()=>node.close();},[]);
  return <dialog ref={ref} className={`strat-modal ${className}`} aria-label={title} onCancel={e=>{e.preventDefault();if(dismissible)onClose();}}><header><h2>{title}</h2>{dismissible&&<button aria-label="Close / 关闭" onClick={onClose}>×</button>}</header>{children}</dialog>;
}
