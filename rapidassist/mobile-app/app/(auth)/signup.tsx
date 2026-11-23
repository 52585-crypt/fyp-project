import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { DetailsStep } from "../../src/auth/signup/DetailsStep";
import { DocumentsStep, LocationStep, ServiceStep } from "../../src/auth/signup/ProviderSteps";
import { RoleStep } from "../../src/auth/signup/RoleStep";
import { stepTitles } from "../../src/auth/signupSteps";
import { useSignupWizard } from "../../src/auth/useSignupWizard";
import { Banner, Button, Header, ProgressStepper, Screen, Text } from "../../src/design/components";
import { tokens } from "../../src/design/tokens";

const headings = {
  role: { user: "Create an account", mechanic: "Become a Service Provider" },
  service: "Choose your service",
  details: "Tell us about you",
  documents: "Upload documents",
  location: "Your service area"
} as const;

/** Step wizard. Customer: Role → Details. Provider: Role → Service → Details → Documents → Location. */
export default function Signup() {
  const w = useSignupWizard();
  const index = w.steps.indexOf(w.step);
  const last = index === w.steps.length - 1;
  const provider = w.role === "mechanic";
  const heading = w.step === "role" ? headings.role[w.role] : headings[w.step];
  const providerSteps = w.steps.slice(1).map((s) => stepTitles[s]).concat("Verify ID");

  const footer = w.step === "role" && provider ? (
    <LoginLink provider />
  ) : (
    <>
      {last ? (
        <Button title={provider ? "Continue to identity verification" : "Create account"} loading={w.loading}
          disabled={!w.canSubmit || w.loading || w.googleLoading} onPress={w.submit} />
      ) : (
        <Button title="Next" disabled={!w.canMoveNext} onPress={w.next} />
      )}
      {w.step === "role" ? <LoginLink provider={false} /> : null}
    </>
  );

  return (
    <Screen
      header={<Header title={provider && w.step !== "role" ? `Step ${index} of ${w.steps.length - 1}` : undefined}
        back={w.loading || w.accountLocked ? false : w.back} />}
      footer={footer}
    >
      {provider && w.step !== "role" ? <ProgressStepper steps={providerSteps} current={index - 1} /> : null}
      <View style={styles.heading}>
        <Text variant="display">{heading}</Text>
        {w.step === "role" ? <Text variant="bodySmall" color="muted">RapidAssist — your roadside companion.</Text> : null}
      </View>
      {w.error ? <Banner tone="danger" message={w.error} /> : null}
      {w.step === "role" ? <RoleStep w={w} /> : null}
      {w.step === "service" ? <ServiceStep w={w} /> : null}
      {w.step === "details" ? <DetailsStep w={w} /> : null}
      {w.step === "documents" ? <DocumentsStep w={w} /> : null}
      {w.step === "location" ? <LocationStep w={w} /> : null}
    </Screen>
  );
}

function LoginLink({ provider }: { provider: boolean }) {
  return (
    <Button title="I already have an account" variant="ghost"
      onPress={() => router.push(provider ? { pathname: "/(auth)/login", params: { role: "mechanic" } } : "/(auth)/login")} />
  );
}

const styles = StyleSheet.create({
  heading: { gap: tokens.space.xs }
});
