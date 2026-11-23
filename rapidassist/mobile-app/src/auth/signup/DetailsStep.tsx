import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Avatar, IconButton, Input, Text } from "../../design/components";
import { tokens } from "../../design/tokens";
import { GoogleSignInOption } from "../GoogleSignInOption";
import type { SignupWizard } from "../useSignupWizard";

export function DetailsStep({ w }: { w: SignupWizard }) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <View style={styles.stack}>
      <Input label="Full name" icon="person-outline" autoCapitalize="words" autoComplete="name" value={w.name}
        editable={w.nameEditable} onChangeText={w.setName}
        error={w.name.length > 0 && w.name.trim().length < 2 ? "Enter at least 2 characters." : null} />
      {w.googleDraft ? (
        <View style={styles.google}>
          <Avatar name={w.googleDraft.profile.name} size={tokens.sizes.iconTile} />
          <View style={styles.flex}>
            <Text variant="captionStrong">Google account</Text>
            <Text variant="caption" color="muted">{w.googleDraft.profile.email}</Text>
          </View>
        </View>
      ) : null}
      <Input label="Mobile number" icon="call-outline" placeholder="03001234567" keyboardType="phone-pad" autoComplete="tel"
        value={w.phone} editable={w.phoneEditable} onChangeText={w.setPhone}
        error={w.phone.length > 0 && w.phone.trim().length < 10 ? "Enter at least 10 digits for your mobile number." : null} />
      {w.needsPassword ? (
        <Input label="Password" icon="lock-closed-outline" placeholder="At least 6 characters" secureTextEntry={!showPassword}
          autoComplete="new-password" value={w.password} onChangeText={w.setPassword}
          error={w.password.length > 0 && w.password.length < 6 ? "Use at least 6 characters." : null}
          right={<IconButton icon={showPassword ? "eye-off-outline" : "eye-outline"} label={showPassword ? "Hide password" : "Show password"}
            tone="plain" color="muted" size={tokens.sizes.buttonSmall} onPress={() => setShowPassword((v) => !v)} />} />
      ) : null}
      {w.role === "user" ? (
        <GoogleSignInOption loading={w.googleLoading} disabled={w.loading} onPress={w.onGoogleSignIn}
          onCredential={w.onCustomerGoogleCredential} onError={w.onGoogleError} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: tokens.space.lg },
  google: {
    flexDirection: "row", alignItems: "center", gap: tokens.space.md, padding: tokens.space.md,
    borderRadius: tokens.radius.md, backgroundColor: tokens.color.primarySoft
  },
  flex: { flex: 1 }
});
