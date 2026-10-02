import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import HoldGuidanceProvider from './components/HoldGuidanceProvider';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <HoldGuidanceProvider>
            <App />
        </HoldGuidanceProvider>
    </React.StrictMode>
);
