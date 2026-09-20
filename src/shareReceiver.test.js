jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: jest.fn() },
  registerPlugin: jest.fn(),
}));

// resetModules() clears the require cache each test, which also re-invokes
// the mock factory above — so Capacitor/registerPlugin must be re-required
// fresh afterward, not captured once at file scope, or mockReturnValue calls
// land on a stale instance shareReceiver.js never sees.
let Capacitor;
let registerPlugin;

describe('shareReceiver on web (non-native)', () => {
  beforeEach(() => {
    jest.resetModules();
    ({ Capacitor, registerPlugin } = require('@capacitor/core'));
    Capacitor.isNativePlatform.mockReturnValue(false);
  });

  it('getPendingSharedText resolves empty without touching the plugin registry', async () => {
    const { getPendingSharedText } = require('./shareReceiver');
    await expect(getPendingSharedText()).resolves.toBe('');
    expect(registerPlugin).not.toHaveBeenCalled();
  });

  it('onShareReceived no-ops and returns a safe unsubscribe', () => {
    const { onShareReceived } = require('./shareReceiver');
    const unsubscribe = onShareReceived(jest.fn());
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe('shareReceiver on native', () => {
  let plugin;

  beforeEach(() => {
    jest.resetModules();
    ({ Capacitor, registerPlugin } = require('@capacitor/core'));
    Capacitor.isNativePlatform.mockReturnValue(true);
    plugin = {
      getSharedText: jest.fn(),
      addListener: jest.fn(),
    };
    registerPlugin.mockReturnValue(plugin);
  });

  it('getPendingSharedText returns and forwards the native plugin text', async () => {
    plugin.getSharedText.mockResolvedValue({ text: 'milk\neggs' });
    const { getPendingSharedText } = require('./shareReceiver');
    await expect(getPendingSharedText()).resolves.toBe('milk\neggs');
  });

  it('getPendingSharedText resolves empty if the native call rejects', async () => {
    plugin.getSharedText.mockRejectedValue(new Error('unavailable'));
    const { getPendingSharedText } = require('./shareReceiver');
    await expect(getPendingSharedText()).resolves.toBe('');
  });

  it('onShareReceived subscribes to the shareReceived event and unwraps text', () => {
    const remove = jest.fn();
    plugin.addListener.mockReturnValue({ remove });
    const { onShareReceived } = require('./shareReceiver');
    const cb = jest.fn();
    const unsubscribe = onShareReceived(cb);

    expect(plugin.addListener).toHaveBeenCalledWith('shareReceived', expect.any(Function));
    const handler = plugin.addListener.mock.calls[0][1];
    handler({ text: 'bread' });
    expect(cb).toHaveBeenCalledWith('bread');

    unsubscribe();
    expect(remove).toHaveBeenCalled();
  });
});
