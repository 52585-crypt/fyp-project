import { StyleSheet, View } from "react-native";
import { Avatar, Banner, Button, Card, Icon, Input, Text } from "../../design/components";
import { tokens } from "../../design/tokens";
import { GoogleSignInButton } from "../GoogleSignInButton";
import type { SignupWizard } from "../useSignupWizard";

const roles = [
  { value: "user", title: "I need roadside help", subtitle: "Book towing, fuel delivery or a mechanic", icon: "person-outline" },
  { value: "mechanic", title: "I'm a service provider", subtitle: "Mechanic, tow driver or fuel delivery", icon: "construct-outline" }
] as const;

/** Step 1: account type. Providers also choose Google or phone here. */
export function RoleStep({ w }: { w: SignupWizard }) {
  if (w.recognized && w.googleDraft) {
    return (
      <Card>
        <Text variant="title">Welcome Back!</Text>
        <Text variant="bodySmall" color="muted">You already have a RapidAssist customer account. You can use the same account to become a service provider.</Text>
        <View style={styles.account}>
          <Avatar name={w.googleDraft.profile.name} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">{w.googleDraft.profile.name}</Text>
            <Text variant="caption" color="muted">{w.googleDraft.profile.email}</Text>
          </View>
        </View>
        <Button title="Continue as Service Provider" disabled={w.loading} onPress={w.continueAsProvider} />
        <Button title="Back to Customer" variant="outline" loading={w.loading} onPress={w.returnToCustomer} />
      </Card>
    );
  }
  return (
    <View style={styles.stack}>
      {!w.providerOnlyEntry ? roles.map((r) => {
        const selected = w.role === r.value;
        return (
          <Card key={r.value} tone={selected ? "selected" : "surface"} onPress={() => w.selectRole(r.value)} accessibilityLabel={r.title}>
            <View style={styles.account}>
              <View style={[styles.icon, selected && styles.iconOn]}>
                <Icon name={r.icon} color={selected ? "onPrimary" : "primary"} />
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong" color={selected ? "primary" : "text"}>{r.title}</Text>
                <Text variant="caption" color="muted">{r.subtitle}</Text>
              </View>
            </View>
          </Card>
        );
      }) : null}
      {w.role === "mechanic" ? (
        <Card>
          <Text variant="headline">Create your provider account</Text>
          <Text variant="bodySmall" color="muted">Providers complete identity and document verification before receiving jobs.</Text>
          {w.linking ? (
            <>
              <Banner message="Confirm your current password, then sign in with Google to link it to this customer account." />
              <Input label="Current password" secureTextEntry autoComplete="current-password" value={w.password} onChangeText={w.setPassword} />
            </>
          ) : null}
          <GoogleSignInButton loading={w.googleLoading} disabled={w.googleDisabled} onPress={w.onGoogleSignIn}
            onCredential={w.onProviderGoogleCredential} onError={w.onGoogleError} />
          {!w.linking ? <Button title="Continue with Phone" icon="call-outline" disabled={w.googleLoading} onPress={w.choosePhone} /> : null}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: tokens.space.md },
  account: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  flex: { flex: 1, gap: tokens.space.xxs },
  icon: {
    width: tokens.sizes.iconTile, height: tokens.sizes.iconTile, borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.primarySoft, alignItems: "center", justifyContent: "center"
  },
  iconOn: { backgroundColor: tokens.color.primary }
});
