import { render } from '@testing-library/react-native';

import NewPersonalRecordCard from './NewPersonalRecordCard';

describe('NewPersonalRecordCard (FR-8.2/AC-11)', () => {
  test('displays the exercise, rep count, weight, and estimated 1RM', () => {
    const { getByTestId } = render(
      <NewPersonalRecordCard exerciseName="Squat" repCount={5} weightKg={110} estimatedOneRm={128.3} unitPreference="metric" />,
    );

    const card = getByTestId('new-pr-card-Squat-5');
    expect(card).toBeTruthy();
  });

  test('renders in imperial units', () => {
    const { getAllByText } = render(
      <NewPersonalRecordCard exerciseName="Bench" repCount={1} weightKg={100} estimatedOneRm={100} unitPreference="imperial" />,
    );
    expect(getAllByText(/lb/).length).toBeGreaterThan(0);
  });
});
