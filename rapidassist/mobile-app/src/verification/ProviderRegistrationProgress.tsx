import { ProgressStepper } from "../design/components";

/** Onboarding progress after signup: the account steps are done, identity + review remain. */
const steps = ["Service", "Account", "Documents", "Identity", "Review"];

export function ProviderRegistrationProgress({ currentStep }: { currentStep: number }) {
  return <ProgressStepper steps={steps} current={currentStep} />;
}
