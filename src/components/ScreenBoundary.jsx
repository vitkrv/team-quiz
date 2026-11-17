import { Component } from 'react';

export default class ScreenBoundary extends Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() {
        if (!this.state.failed) return this.props.children;
        return <div role="alert" className="mx-auto max-w-xl p-8 text-center text-slate-200">
            <p>{this.props.t('screenLoadFailed')}</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-blue-600 px-4 py-2">
                {this.props.t('screenReload')}
            </button>
        </div>;
    }
}
