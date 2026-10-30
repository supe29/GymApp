import { ScrollView, StyleSheet, Text, View } from 'react-native';

export interface PrivacyPolicyScreenProps {
  onClose?: () => void;
}

/**
 * PR-3: a privacy policy disclosing what data is collected, why, and how
 * it is used, reachable from the sign-up screen before/during account
 * creation. Read-only disclosure (no acknowledgment gate) — unlike
 * `DisclaimerScreen` (SR-5/AC-14), PR-3 requires only that this be
 * presented, not that the user affirmatively accept it.
 */
export default function PrivacyPolicyScreen({ onClose }: PrivacyPolicyScreenProps) {
  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} testID="privacy-policy-scroll">
        <Text style={styles.title}>Privacy Policy</Text>

        <Text style={styles.heading}>What we collect</Text>
        <Text style={styles.body}>
          To build your workout and nutrition plans, we collect your age, height, weight,
          biological sex, fitness level, goal, and declared equipment. As you use the app, we
          store the workout and food logs, body-weight entries, and personal records you create.
        </Text>

        <Text style={styles.heading}>Why we collect it</Text>
        <Text style={styles.body}>
          This data is used only to generate and adjust your own workout plan, nutrition targets,
          and progress tracking. It is never used to produce anyone else&apos;s plan.
        </Text>

        <Text style={styles.heading}>Who can see it</Text>
        <Text style={styles.body}>
          Only you. Every table holding this data is restricted at the database level so no other
          account, including other app users, can read, modify, or delete it.
        </Text>

        <Text style={styles.heading}>Sharing with third parties</Text>
        <Text style={styles.body}>
          We do not sell or share your personal data with third parties for advertising or
          unrelated purposes. When a food or barcode lookup is sent to an external data source, it
          contains only the search text or barcode value itself &mdash; never your identity,
          profile, or account information.
        </Text>

        <Text style={styles.heading}>Data in transit</Text>
        <Text style={styles.body}>
          All communication between the app and our servers is encrypted (HTTPS/TLS).
        </Text>

        <Text style={styles.heading}>Deleting your data</Text>
        <Text style={styles.body}>
          You can permanently delete your account and all associated data at any time from
          Settings. Deletion is permanent, not a deactivation, and removes every row tied to your
          account, including historical plan and target versions.
        </Text>
      </ScrollView>

      {onClose ? (
        <Text testID="privacy-policy-close" style={styles.closeLink} onPress={onClose}>
          Close
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  scroll: { flex: 1 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 16 },
  heading: { fontSize: 15, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  body: { fontSize: 14, lineHeight: 20 },
  closeLink: {
    textAlign: 'center',
    color: '#111',
    textDecorationLine: 'underline',
    paddingTop: 16,
  },
});
