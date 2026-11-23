const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const onboardingRoute = { pathname: "/(provider)/verification", params: { onboarding: "1" } };

function load(file, mocks) {
  const filename = path.resolve(__dirname, "..", file);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { Error, URLSearchParams, module, exports: module.exports, require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name) }, { filename });
  return module.exports;
}

function navigationHelpers() {
  return load("src/auth/customerNavigation.ts", { "../requests/requestId": load("src/requests/requestId.ts", {}) });
}

test("shared Google flow exchanges web credentials and native tokens and routes by phone", async () => {
  const exchanged = [], sessions = [], routes = [], errors = [];
  let nativeCalls = 0;
  let phone = null;
  const { useGoogleSignIn } = load("src/auth/GoogleSignInOption.tsx", {
    "./customerNavigation": navigationHelpers(),
    react: { ...React, useState: () => [false, () => {}], useRef: (initial) => ({ current: initial }) },
    "expo-router": { router: { replace: (route) => routes.push(route) } },
    "react-native": { StyleSheet: { create: (s) => s }, Text: "Text", View: "View" },
    "./auth.api": {
      authDestination: (user) => user.phone ? "/(user)/home" : "/(auth)/complete-profile",
      loginWithGoogle: async (credential, intent) => { exchanged.push([credential, intent]); return { token: "session", user: { role: "user", phone } }; }
    },
    "./AuthProvider": { useAuth: () => ({ setSession: async (...args) => sessions.push(args) }) },
    "./googleSignIn": { getGoogleIdToken: async () => { nativeCalls++; return "native-id"; } },
    "../config/api": { getNetworkErrorMessage: (error) => error.message },
    "./GoogleSignInButton": { GoogleSignInButton: () => null },
    "../ui/system": { ui: { colors: {} } }
  });
  const flow = useGoogleSignIn((error) => errors.push(error));
  await flow.onGoogleCredential("web-id");
  assert.equal(nativeCalls, 0);
  assert.deepEqual(exchanged[0], ["web-id", "customer"]);
  assert.equal(routes[0], "/(auth)/complete-profile");
  phone = "03000000000";
  await flow.onGoogleSignIn();
  assert.equal(nativeCalls, 1);
  assert.deepEqual(exchanged[1], ["native-id", "customer"]);
  assert.equal(routes[1], "/(user)/home");
  assert.equal(sessions.length, 2);
  assert.deepEqual(errors, [null, null]);
});

test("web button forwards Google credential and reports missing credential", () => {
  const GoogleLogin = () => null;
  let received, failures = 0;
  const { GoogleSignInButton } = load("src/auth/GoogleSignInButton.web.tsx", {
    "@react-oauth/google": { GoogleLogin },
    "react-native": { Text: "Text", View: "View" },
    "../ui/components": { PrimaryButton: () => null },
    "./GoogleOAuthRoot.web": { useGoogleWebStatus: () => "ready" }
  });
  const element = GoogleSignInButton({ loading: false, disabled: false, onCredential: (token) => { received = token; }, onError: () => { failures++; } });
  const googleButton = element.props.children;
  assert.equal(googleButton.type, GoogleLogin);
  assert.equal(googleButton.props.ux_mode, "popup");
  googleButton.props.onSuccess({ credential: "web-id" });
  assert.equal(received, "web-id");
  googleButton.props.onSuccess({});
  assert.equal(failures, 1);
});

test("provider Google session routes to the dashboard, while a new identity returns an in-memory draft", async () => {
  const calls = [], drafts = [], sessions = [], routes = [];
  const profile = { name: "Provider", email: "provider@example.com", profilePictureUrl: null };
  const { useGoogleSignIn } = load("src/auth/GoogleSignInOption.tsx", {
    "./customerNavigation": navigationHelpers(),
    react: { ...React, useState: () => [false, () => {}], useRef: (initial) => ({ current: initial }) },
    "expo-router": { router: { replace: (route) => routes.push(route) } },
    "react-native": { StyleSheet: { create: (s) => s } },
    "./auth.api": {
      authDestination: (_, onboarding) => onboarding ? onboardingRoute : "/(provider)/dashboard",
      loginWithGoogle: async (token, intent) => {
        calls.push([token, intent]);
        return intent === "mechanic_register" && token === "web-id"
          ? { registrationRequired: true, profile } : { token: "session", user: { role: "mechanic" } };
      }
    },
    "./AuthProvider": { useAuth: () => ({ setSession: async (...args) => sessions.push(args) }) },
    "./googleSignIn": { getGoogleIdToken: async (selectAccount) => {
      assert.equal(selectAccount, true);
      return "android-id";
    } },
    "../config/api": {}, "./GoogleSignInButton": {}, "../ui/system": { ui: { colors: {} } }
  });
  await useGoogleSignIn(() => {}, "mechanic_register", (...args) => drafts.push(args)).onGoogleCredential("web-id");
  assert.deepEqual(drafts, [[profile, "web-id", undefined]]);
  assert.deepEqual(sessions, []);
  await useGoogleSignIn(() => {}, "mechanic_login").onGoogleSignIn();
  await useGoogleSignIn(() => {}, "mechanic_register").onGoogleCredential("existing-provider");
  assert.deepEqual(calls, [["web-id", "mechanic_register"], ["android-id", "mechanic_login"], ["existing-provider", "mechanic_register"]]);
  assert.deepEqual(sessions, Array(2).fill(["session", { role: "mechanic" }]));
  assert.deepEqual(routes, ["/(provider)/dashboard", onboardingRoute]);
});

function findElement(element, predicate) {
  if (!React.isValidElement(element)) return undefined;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
}

function mockHooks() {
  const states = [], refs = [];
  let stateIndex = 0, refIndex = 0;
  return {
    reset: () => { stateIndex = refIndex = 0; },
    react: {
      ...React,
      useState: (initial) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useRef: (initial) => {
        const index = refIndex++;
        return refs[index] ?? (refs[index] = { current: initial });
      },
      useMemo: (fn) => fn()
    }
  };
}

for (const method of ["google", "phone", "enrollment", "link", "phone-resume"]) {
  test(`provider ${method} signup collects service, details and documents before creating an account`, async () => {
    const hooks = mockHooks();
    const GoogleSignInButton = () => null;
    const RATextInput = () => null;
    const requests = [], enrollments = [], links = [], routes = [], recoveries = [];
    const manual = method === "phone" || method === "phone-resume";
    const upgrading = method === "enrollment" || method === "link";
    const profile = { name: "Google Provider", email: "provider@example.com", profilePictureUrl: null,
      phone: upgrading ? "03001112222" : null };
    const Signup = load("app/(auth)/signup.tsx", {
      react: hooks.react,
      "react-native": { StyleSheet: { create: (styles) => styles }, Image: "Image", Platform: { OS: "web" }, Pressable: "Pressable", SafeAreaView: "SafeAreaView", ScrollView: "ScrollView", Text: "Text", View: "View" },
      "expo-router": { Link: "Link", router: { replace: (route) => routes.push(route) },
        useLocalSearchParams: () => ({ role: "mechanic", linkGoogle: method === "link" ? "1" : undefined }) },
      "@expo/vector-icons": { Ionicons: "Ionicons" },
      "expo-image-picker": { launchImageLibraryAsync: async () => ({ assets: [{ uri: "fixture", base64: "AA", mimeType: "image/jpeg" }] }) },
      "expo-location": {},
      "../../src/theme/colors": { colors: {} },
      "../../src/components/RATextInput": { RATextInput },
      "../../src/components/RAButton": { RAButton: () => null },
      "../../src/ui/components": { PrimaryButton: () => null },
      "../../src/verification/ProviderRegistrationProgress": { ProviderRegistrationProgress: () => null },
      "../../src/auth/auth.api": {
        authDestination: (user, onboarding) => onboarding && user.role === "mechanic" ? onboardingRoute : "/(user)/home",
        recoverProviderRegistration: async (credentials) => {
          recoveries.push(credentials);
          return { token: "recovered", user: { role: "mechanic" } };
        },
        linkGoogleAccount: async (...args) => { links.push(args); return { profile, enrollmentTicket: "one-time-ticket" }; },
        enrollProvider: async (body) => {
        enrollments.push(body);
        return { token: "session", user: { role: "mechanic", roles: ["user", "mechanic"] } };
      }, register: async (body) => {
        requests.push(body);
        if (method === "phone-resume") throw Object.assign(new Error("Phone already registered"), { response: { status: 409 } });
        return { token: "session", user: { role: "mechanic" } };
      } },
      "../../src/auth/AuthProvider": { useAuth: () => ({
        setSession() {}, updateUser() {},
        ...(method === "link" ? { token: "customer-session", user: { role: "user", authProvider: "local" } } : {})
      }) },
      "../../src/auth/GoogleSignInOption": { useGoogleSignIn: (_, intent, onDraft, exchange) => {
        assert.equal(intent, "mechanic_register");
        return { googleLoading: false, onGoogleCredential: async (token) => {
          const result = exchange ? await exchange(token) : { profile, enrollmentTicket: upgrading ? "one-time-ticket" : undefined };
          onDraft(result.profile, token, result.enrollmentTicket);
        } };
      } },
      "../../src/auth/GoogleSignInButton": { GoogleSignInButton },
      "../../src/config/api": { getNetworkErrorMessage: (error) => error.message }
    }).default;
    const find = (predicate) => {
      hooks.reset();
      return findElement(Signup(), predicate);
    };
    const button = (title) => find((el) => el.props.title === title);
    const field = (label) => find((el) => el.type === RATextInput && el.props.accessibilityLabel === label);
    if (method === "link") {
      assert.equal(find((el) => el.type === GoogleSignInButton).props.disabled, true);
      field("Current password").props.onChangeText("confirmed-password");
    }
    if (!manual) await find((el) => el.type === GoogleSignInButton).props.onCredential("google-id");
    else button("Continue with Phone").props.onPress();
    if (method === "link") assert.deepEqual(links, [["customer-session", "google-id", "confirmed-password"]]);
    if (upgrading) {
      assert.ok(find((el) => el.props.children === "Welcome Back!"));
      assert.ok(button("Back to Customer"));
      assert.equal(enrollments.length, 0);
      button("Continue as Service Provider").props.onPress();
    }
    button("Next").props.onPress();
    if (!manual) {
      assert.equal(field("Full name").props.value, "Google Provider");
      assert.equal(field("Password"), undefined);
    } else {
      field("Full name").props.onChangeText("Manual Provider");
      field("Password").props.onChangeText("password");
    }
    if (upgrading) {
      assert.equal(field("Mobile number").props.value, "03001112222");
      assert.equal(field("Mobile number").props.editable, false);
    } else {
      assert.equal(button("Next").props.disabled, true);
      field("Mobile number").props.onChangeText("03001112222");
    }
    button("Next").props.onPress();
    assert.equal(button("Continue to identity verification").props.disabled, true);
    for (const title of ["Workshop photo", "Mechanic certificate"]) {
      const row = find((el) => el.props.title === title && el.props.onGallery);
      await row.props.onGallery();
    }
    assert.equal(requests.length, 0);
    const create = button("Continue to identity verification").props.onPress;
    await Promise.all([create(), create()]);
    if (upgrading) {
      assert.equal(requests.length, 0);
      assert.equal(enrollments.length, 1);
      assert.equal(enrollments[0].enrollmentTicket, "one-time-ticket");
      assert.equal(enrollments[0].phone, "03001112222");
      assert.deepEqual(routes, [onboardingRoute]);
      return;
    }
    assert.equal(requests.length, 1);
    assert.equal(requests[0].phone, "03001112222");
    assert.equal(requests[0].googleIdToken, method === "google" ? "google-id" : undefined);
    assert.equal(requests[0].password, manual ? "password" : undefined);
    assert.equal(requests[0].email, undefined);
    assert.equal(recoveries.length, method === "phone-resume" ? 1 : 0);
    assert.deepEqual(routes, [onboardingRoute]);
  });
}

test("Login restores the existing manual provider session and lets users choose the Google provider intent", async () => {
  const hooks = mockHooks();
  const requests = [], sessions = [], routes = [];
  let intent;
  const Login = load("app/(auth)/login.tsx", {
    "../../src/auth/customerNavigation": navigationHelpers(),
    react: hooks.react,
    "react-native": { StyleSheet: { create: (s) => s }, Text: "Text", View: "View", ScrollView: "ScrollView", Pressable: "Pressable", Image: "Image" },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "expo-router": { Link: "Link", useLocalSearchParams: () => ({}), router: { replace: (route) => routes.push(route) } },
    "../../src/auth/GoogleSignInOption": { useGoogleSignIn: (_, value) => { intent = value; return { googleLoading: false }; } },
    "../../src/auth/GoogleSignInButton": { GoogleSignInButton: () => null },
    "../../src/auth/AuthProvider": { useAuth: () => ({ setSession: async (...args) => sessions.push(args) }) },
    "../../src/auth/auth.api": {
      authDestination: (user) => user.role === "mechanic" ? "/(provider)/dashboard" : "/(user)/home",
      login: async (body) => { requests.push(body); return { token: "manual-jwt", user: { role: "mechanic" } }; }
    },
    "../../src/components/RATextInput": { RATextInput: () => null },
    "../../src/ui/components": { PrimaryButton: () => null },
    "../../src/config/api": {},
    "../../src/theme/tokens": { tokens: { colors: {}, borders: {}, radii: {}, typography: { fonts: {} } } },
    "../../assets/icon.png": "logo"
  }).default;
  const find = (predicate) => { hooks.reset(); return findElement(Login(), predicate); };
  find((el) => el.props.accessibilityLabel === "Mobile number").props.onChangeText(" 03001112222 ");
  assert.equal(intent, "customer");
  find((el) => el.props.accessibilityLabel === "Password").props.onChangeText("password");
  find((el) => el.props.accessibilityRole === "radio" && el.props.children.props.children === "Provider").props.onPress();
  const button = find((el) => el.props.title === "Sign in with phone");
  assert.equal(intent, "mechanic_login");
  await Promise.all([button.props.onPress(), button.props.onPress()]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].phone, "03001112222");
  assert.equal(requests[0].password, "password");
  assert.deepEqual(sessions, [["manual-jwt", { role: "mechanic" }]]);
  assert.deepEqual(routes, ["/(provider)/dashboard"]);
});

test("account mode switching replaces the session and routes pending providers to verification", async () => {
  const hooks = mockHooks();
  const sessions = [], changes = [], routes = [];
  let activeRole = "user";
  const AccountModeAction = load("src/auth/AccountModeAction.tsx", {
    react: hooks.react,
    "expo-router": { router: { replace: (route) => routes.push(route) } },
    "../config/api": { getNetworkErrorMessage: (error) => error.message },
    "../ui/components": { NoticeBanner: () => null, PrimaryButton: () => null },
    "./AuthProvider": { useAuth: () => ({
      token: "signed-session",
      user: { role: activeRole, activeRole, roles: ["user", "mechanic"] },
      setSession: async (token, user) => { sessions.push(token); activeRole = user.activeRole; }
    }) },
    "./auth.api": {
      authDestination: () => "/(user)/home",
      changeActiveRole: async (token, role) => {
        changes.push([token, role]);
        return { token: `signed-${role}`, user: { activeRole: role, verificationStatus: "pending" } };
      }
    }
  }).AccountModeAction;
  function button(title) {
    hooks.reset();
    return findElement(AccountModeAction(), (element) => element.props.title === title);
  }
  const provider = button("Switch to Provider");
  await Promise.all([provider.props.onPress(), provider.props.onPress()]);
  await button("Switch to Customer").props.onPress();
  assert.deepEqual(changes, [["signed-session", "mechanic"], ["signed-session", "user"]]);
  assert.deepEqual(sessions, ["signed-mechanic", "signed-user"]);
  assert.deepEqual(routes, ["/(provider)/verification", "/(user)/home"]);
});

test("provider onboarding resumes at identity, requires consent and both photos, then reviews and retries the same submission", async () => {
  const hooks = mockHooks();
  const PrimaryButton = () => null;
  const AppShell = () => null;
  const Progress = () => null;
  const SummaryPhotoUri = "data:image/jpeg;base64,workshop-fixture";
  const picked = [], uploads = [], routes = [];
  let status = { reviewState: null, verificationStatus: "pending", submissionId: null };
  const ProviderVerification = load("app/(provider)/verification/index.tsx", {
    react: { ...hooks.react, useEffect: () => {} },
    "expo-router": { Redirect: "Redirect", useLocalSearchParams: () => ({ onboarding: "1" }),
      router: { dismissTo: (route) => routes.push(route) } },
    "react-native": { Platform: { OS: "android" }, StyleSheet: { create: (s) => s }, ActivityIndicator: "ActivityIndicator",
      Image: "Image", Pressable: "Pressable", Text: "Text", View: "View" },
    "@expo/vector-icons": { Ionicons: "Ionicons" },
    "../../../src/theme/tokens": { tokens: { spacing: {}, colors: {}, radii: {}, typography: { sizes: {}, lineHeights: {} } } },
    "../../../src/ui/components": { AppShell, Card: "Card", IconBox: "IconBox", NoticeBanner: "NoticeBanner", PrimaryButton, StatusStamp: "StatusStamp" },
    "../../../src/auth/AuthProvider": { useAuth: () => ({ token: "provider-token", user: {
      role: "mechanic", name: "Existing Provider", email: "provider@example.com", phone: "03001112222",
      profilePictureUrl: "https://example.test/avatar", mechanicProfile: { workshopPhotoUrl: SummaryPhotoUri }
    } }) },
    "../../../src/requests/serviceCatalog": { getProviderServiceTitle: () => "Car Mechanic" },
    "../../../src/verification/ProviderRegistrationProgress": { ProviderRegistrationProgress: Progress },
    "../../../src/verification/verification": {
      canSubmitVerification: (current) => !current.submissionId,
      verificationPresentation: () => ({ title: "Pending review", tone: "accent", message: "Pending review" })
    },
    "../../../src/verification/VerificationProvider": { useVerification: () => ({ status, submit: async (draft) => {
      uploads.push(draft);
      if (uploads.length === 1) throw new Error("Network unavailable");
      status = { ...status, submissionId: "saved", reviewState: "awaiting_review", matchResult: "mismatch" };
      return true;
    } }) },
    "../../../src/verification/verificationImage": { selectVerificationImage: async (source, kind) => {
      picked.push([source, kind]);
      return `${kind}-photo-${picked.length}`;
    } }
  }).default;
  const find = (predicate) => { hooks.reset(); return findElement(ProviderVerification(), predicate); };
  const button = (title) => find((el) => el.type === PrimaryButton && el.props.title === title);
  assert.equal(find((el) => el.type === AppShell).props.title, "Identity verification");
  assert.equal(find((el) => el.type === Progress).props.currentStep, 3);
  assert.equal(button("Review & submit").props.disabled, true);
  const consent = find((el) => el.props.accessibilityRole === "checkbox");
  assert.equal(button("Take selfie").props.disabled, true);
  await button("Take selfie").props.onPress();
  assert.deepEqual(picked, []);
  consent.props.onPress();
  await button("Take selfie").props.onPress();
  assert.equal(button("Review & submit").props.disabled, true);
  await button("Choose CNIC photo").props.onPress();
  button("Review & submit").props.onPress();
  assert.equal(find((el) => el.type === Progress).props.currentStep, 4);
  assert.ok(find((el) => el.props.user?.mechanicProfile?.workshopPhotoUrl === SummaryPhotoUri));
  assert.ok(find((el) => el.props.title === "Consent confirmed"));
  button("Back to identity verification").props.onPress();
  await button("Replace selfie").props.onPress();
  button("Review & submit").props.onPress();
  await button("Submit for review").props.onPress();
  assert.ok(find((el) => el.props.message === "Network unavailable"));
  await button("Submit for review").props.onPress();
  assert.equal(uploads.length, 2);
  assert.equal(uploads[1].profilePhoto, "profile-photo-3");
  assert.equal(uploads[1].cnicFront, "cnic-photo-2");
  assert.equal(uploads[1].biometricConsent, true);
  assert.ok(find((el) => el.props.label === "Pending admin review"));
  assert.ok(find((el) => el.props.title === "AI comparison did not find a match"));
  button("Back to dashboard").props.onPress();
  assert.deepEqual(routes, ["/(provider)/dashboard"]);
});
