import { fireEvent, render } from '@testing-library/react-native';

import PrivacyPolicyScreen from './PrivacyPolicyScreen';

describe('PrivacyPolicyScreen (PR-3)', () => {
  test('renders the policy content', () => {
    const { getByText } = render(<PrivacyPolicyScreen />);

    expect(getByText('Privacy Policy')).toBeTruthy();
    expect(getByText('What we collect')).toBeTruthy();
    expect(getByText('Sharing with third parties')).toBeTruthy();
    expect(getByText('Deleting your data')).toBeTruthy();
  });

  test('pressing Close calls onClose', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(<PrivacyPolicyScreen onClose={onClose} />);

    fireEvent.press(getByTestId('privacy-policy-close'));

    expect(onClose).toHaveBeenCalled();
  });

  test('renders without a Close link when onClose is not provided', () => {
    const { queryByTestId } = render(<PrivacyPolicyScreen />);

    expect(queryByTestId('privacy-policy-close')).toBeNull();
  });
});
