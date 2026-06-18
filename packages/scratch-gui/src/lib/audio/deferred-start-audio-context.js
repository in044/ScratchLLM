const startedContexts = typeof WeakSet === 'undefined' ? null : new WeakSet();

const canTrackContext = context => startedContexts && context && typeof context === 'object';

module.exports = function (context) {
    if (typeof document === 'undefined' || !context) return Promise.resolve();
    if (context.state === 'running') return Promise.resolve();
    if (canTrackContext(context) && startedContexts.has(context)) return Promise.resolve();
    if (canTrackContext(context)) startedContexts.add(context);

    return new Promise(resolve => {
        const start = () => {
            document.removeEventListener('mousedown', start);
            document.removeEventListener('touchstart', start);
            document.removeEventListener('keydown', start);
            if (context.resume) {
                Promise.resolve(context.resume()).then(resolve, resolve);
            } else {
                resolve();
            }
        };

        document.addEventListener('mousedown', start);
        document.addEventListener('touchstart', start);
        document.addEventListener('keydown', start);
    });
};
