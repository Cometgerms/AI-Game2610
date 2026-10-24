import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './workspace.css';
import './agency.css';
import './sandbox.css';
import './network.css';
import './dashboard.css';
import './strat.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
