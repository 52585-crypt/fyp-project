import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appColors } from "../constants/theme";

type Props = {
  value: number;
  onChange?: (value: number) => void;
};

export function RatingComponent({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((item) => (
        <Pressable key={item} onPress={() => onChange?.(item)} style={styles.star}>
          <Ionicons name={item <= value ? "star" : "star-outline"} size={30} color={appColors.primary} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", gap: 10 },
  star: { padding: 2 }
});

