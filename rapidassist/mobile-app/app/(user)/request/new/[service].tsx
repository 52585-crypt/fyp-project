import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ServiceSuggestionCard } from "../../../../src/ai/ServiceSuggestionCard";
import { selectionFromSuggestion } from "../../../../src/ai/serviceSuggestion.integration";
import { Banner, Button, Card, Header, Screen, Text } from "../../../../src/design/components";
import { customerRoutes } from "../../../../src/navigation/routes";
import { useBooking } from "../../../../src/requests/booking/BookingProvider";
import { FuelFields, MechanicFields, NotesField, TowingFields, VehicleSection } from "../../../../src/requests/booking/FormSections";
import { LocationSection } from "../../../../src/requests/booking/LocationSection";
import { bookingCopy, mechanicServices } from "../../../../src/requests/booking/options";
import { normalizeBookingCategory } from "../../../../src/requests/booking/category";

/** Service request form (Towing / Fuel / Mechanic). Next step: request/estimate. */
export default function NewRequest() {
  const { service, issue } = useLocalSearchParams<{ service?: string; issue?: string }>();
  const b = useBooking();
  const category = normalizeBookingCategory(service);
  const copy = bookingCopy[category];
  const [aiOpen, setAiOpen] = useState(false);
  const [manualVersion, setManualVersion] = useState(0);

  useEffect(() => { b.setCategory(category); b.setError(null); }, [category]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const preset = mechanicServices.find((s) => s.value === issue);
    if (preset) b.setMechanicIssue(preset.value);
  }, [issue]); // eslint-disable-line react-hooks/exhaustive-deps

  function next() {
    const problem = b.validate();
    if (problem) return b.setError(problem);
    b.setError(null);
    router.push(customerRoutes.estimate);
  }

  return (
    <Screen header={<Header title={copy.title} />}
      footer={<Button title={copy.action} icon="arrow-forward" disabled={b.locating} onPress={next} />}>
      {category === "mechanic" ? <MechanicFields b={b} /> : null}
      {category === "fuel_delivery" ? <LocationSection b={b} target="pickup" title={copy.location} /> : null}
      {category === "fuel_delivery" ? <FuelFields b={b} /> : <VehicleSection b={b} />}
      {category === "car_towing" ? <TowingFields b={b} /> : null}
      {category !== "fuel_delivery" ? <LocationSection b={b} target="pickup" title={copy.location} /> : null}
      {category === "car_towing" ? <LocationSection b={b} target="destination" title="Destination (Drop-off)" /> : null}
      {b.pickup && b.nearby !== null ? (
        <Text variant="caption" color="muted" accessibilityLiveRegion="polite">{b.nearby} providers available nearby</Text>
      ) : null}
      <NotesField b={b} />
      {category === "mechanic" ? (
        <Card tone="soft">
          <Button title={aiOpen ? "Hide AI diagnostic assist" : "Not sure? Try AI diagnostic assist"} icon="sparkles-outline"
            variant="ghost" size="small" onPress={() => setAiOpen((v) => !v)} />
          {aiOpen ? (
            <ServiceSuggestionCard token={b.token} description={b.description} onDescriptionChange={b.setDescription}
              manualSelectionVersion={manualVersion}
              onSuggestionAccepted={(s) => {
                const pick = selectionFromSuggestion(s);
                if (!pick) return;
                setManualVersion((v) => v + 1);
                if (pick.mechanicIssue) b.setMechanicIssue(pick.mechanicIssue);
                if (pick.category !== category) router.setParams({ service: pick.category });
                setAiOpen(false);
              }}
              onSignInRequested={() => router.replace("/(auth)/login")} />
          ) : null}
        </Card>
      ) : null}
      {b.error ? <Banner tone="danger" message={b.error} /> : null}
    </Screen>
  );
}
