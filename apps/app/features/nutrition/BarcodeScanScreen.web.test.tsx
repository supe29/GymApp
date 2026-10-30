import { fireEvent, render, waitFor } from '@testing-library/react-native';

import BarcodeScanScreen from './BarcodeScanScreen.web';

function fakeStream() {
  const stop = jest.fn();
  return { getTracks: () => [{ stop }] } as unknown as MediaStream;
}

describe('BarcodeScanScreen.web (FR-7.1/UX-7/FR-7.4/AC-10)', () => {
  const originalBarcodeDetector = (globalThis as Record<string, unknown>).BarcodeDetector;
  const originalNavigator = (globalThis as Record<string, unknown>).navigator;

  afterEach(() => {
    (globalThis as Record<string, unknown>).BarcodeDetector = originalBarcodeDetector;
    (globalThis as Record<string, unknown>).navigator = originalNavigator;
    jest.useRealTimers();
  });

  test('unsupported browsers (no BarcodeDetector) offer manual entry, never a dead end', async () => {
    delete (globalThis as Record<string, unknown>).BarcodeDetector;

    const onManualEntry = jest.fn();
    const { getByTestId } = render(<BarcodeScanScreen onBarcodeScanned={jest.fn()} onManualEntry={onManualEntry} />);

    await waitFor(() => expect(getByTestId('barcode-scan-unavailable-message')).toBeTruthy());
    fireEvent.press(getByTestId('barcode-scan-manual-entry-button'));
    expect(onManualEntry).toHaveBeenCalled();
  });

  test('denied camera permission offers manual entry, never a dead end', async () => {
    (globalThis as Record<string, unknown>).BarcodeDetector = jest.fn().mockImplementation(() => ({
      detect: jest.fn(),
    }));
    (globalThis as Record<string, unknown>).navigator = {
      mediaDevices: { getUserMedia: jest.fn().mockRejectedValue(new Error('NotAllowedError')) },
    };

    const onManualEntry = jest.fn();
    const { getByTestId } = render(<BarcodeScanScreen onBarcodeScanned={jest.fn()} onManualEntry={onManualEntry} />);

    await waitFor(() => expect(getByTestId('barcode-scan-unavailable-message')).toBeTruthy());
    expect(getByTestId('barcode-scan-unavailable-message').props.children.join('')).toMatch(/denied/i);
    fireEvent.press(getByTestId('barcode-scan-manual-entry-button'));
    expect(onManualEntry).toHaveBeenCalled();
  });

  test('AC-9: a detected barcode calls onBarcodeScanned with its raw value', async () => {
    const detect = jest.fn().mockResolvedValue([{ rawValue: '012345678905' }]);
    (globalThis as Record<string, unknown>).BarcodeDetector = jest.fn().mockImplementation(() => ({ detect }));
    (globalThis as Record<string, unknown>).navigator = {
      mediaDevices: { getUserMedia: jest.fn().mockResolvedValue(fakeStream()) },
    };

    const onBarcodeScanned = jest.fn();
    const { getByTestId } = render(<BarcodeScanScreen onBarcodeScanned={onBarcodeScanned} onManualEntry={jest.fn()} />, {
      createNodeMock: () => ({}),
    });

    await waitFor(() => expect(getByTestId('barcode-scan-scanning-message')).toBeTruthy());
    await waitFor(() => expect(onBarcodeScanned).toHaveBeenCalledWith('012345678905'), { timeout: 2000 });
  });
});
