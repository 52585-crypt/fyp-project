import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CustomButton } from "../../components/CustomButton";
import { CustomInput } from "../../components/CustomInput";
import { DriverCard } from "../../components/DriverCard";
import { RatingComponent } from "../../components/RatingComponent";
import { appColors, radii } from "../../constants/theme";
import { demoProvider } from "../../services/dummyApi";
import { ScreenScaffold } from "../shared/ScreenScaffold";

export function ReviewRatingScreen() {
  const [rating, setRating] = useState(5);
  return (
    <ScreenScaffold title="Rate Your Experience" subtitle="Your feedback improves RapidAssist.">
      <DriverCard driver={demoProvider} />
      <View style={styles.card}>
        <Text style={styles.question}>How was your experience?</Text>
        <RatingComponent value={rating} onChange={setRating} />
        <CustomInput placeholder="Write your comment..." />
        <CustomButton title="Submit Review" />
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, borderRadius: radii.lg, borderWidth: 1, borderColor: appColors.border, backgroundColor: appColors.surface, padding: 14 },
  question: { color: appColors.text, fontSize: 15, fontWeight: "900", textAlign: "center" }
});

