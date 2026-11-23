import { Redirect, useLocalSearchParams } from "expo-router";
import { providerRoutes } from "../../../../src/navigation/routes";

/** Temporary: hands the job to the Jobs tab until the stage-driven job screen lands (phase 6). */
export default function ProviderJob() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <Redirect href={{ pathname: "/jobs", params: id ? { requestId: id } : {} }} />;
}
