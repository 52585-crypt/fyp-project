const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const onboardingRoute = { pathname: "/verification", params: { onboarding: "1" } };

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
      authDestination: (user) => user.phone ? "/home" : "/(auth)/complete-profile",
      loginWithGoogle: async (credential, intent) => { exchanged.push([credential, intent]); return { token: "session", user: { role: "user", phone } }; }
    },
    "./AuthProvider": { useAuth: () => ({ setSession: async (...args) => sessions.push(args) }) },
    "./googleSignIn": { getGoogleIdToken: async () => { nativeCalls++; return "native-id"; } },
    "../config/api": { getNetworkErrorMessage: (error) => error.message },
    "./GoogleSignInButton": { GoogleSignInButton: () => null },
    "../design/components/Text": { Text: "Text" }, "../design/tokens": { tokens: { space: {}, sizes: {}, color: {} } }
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
  assert.equal(routes[1], "/home");
  assert.equal(sessions.length, 2);
  assert.deepEqual(errors, [null, null]);
});

test("web button forwards Google credential and reports missing credential", () => {
  const GoogleLogin = () => null;
  let received, failures = 0;
  const { GoogleSignInButton } = load("src/auth/GoogleSignInButton.web.tsx", {
    "@react-oauth/google": { GoogleLogin },
    "react-native": { Text: "Text", View: "View" },
    "../design/components": { Banner: () => null, Button: () => null },
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
      authDestination: (_, onboarding) => onboarding ? onboardingRoute : "/dashboard",
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
    "../config/api": {}, "./GoogleSignInButton": {}, "../design/components/Text": { Text: "Text" }, "../design/tokens": { tokens: { space: {}, sizes: {}, color: {} } }
  });
  await useGoogleSignIn(() => {}, "mechanic_register", (...args) => drafts.push(args)).onGoogleCredential("web-id");
  assert.deepEqual(drafts, [[profile, "web-id", undefined]]);
  assert.deepEqual(sessions, []);
  await useGoogleSignIn(() => {}, "mechanic_login").onGoogleSignIn();
  await useGoogleSignIn(() => {}, "mechanic_register").onGoogleCredential("existing-provider");
  assert.deepEqual(calls, [["web-id", "mechanic_register"], ["android-id", "mechanic_login"], ["existing-provider", "mechanic_register"]]);
  assert.deepEqual(sessions, Array(2).fill(["session", { role: "mechanic" }]));
  assert.deepEqual(routes, ["/dashboard", onboardingRoute]);
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
    const requests = [], enrollments = [], links = [], routes = [], recoveries = [];
    const manual = method === "phone" || method === "phone-resume";
    const upgrading = method === "enrollment" || method === "link";
    const profile = { name: "Google Provider", email: "provider@example.com", profilePictureUrl: null,
      phone: upgrading ? "03001112222" : null };
    const { useSignupWizard } = load("src/auth/useSignupWizard.ts", {
      react: hooks.react,
      "expo-router": { router: { replace: (route) => routes.push(route), canGoBack: () => false },
        useLocalSearchParams: () => ({ role: "mechanic", linkGoogle: method === "link" ? "1" : undefined }) },
      "./signupMedia": {
        pickDocumentPhoto: async () => "data:image/jpeg;base64,AA",
        captureDocumentPhoto: async () => null,
        captureLiveLocation: async () => ({ lat: 1, lng: 2, addressText: null })
      },
      "./signupSteps": load("src/auth/signupSteps.ts", {}),
      "./auth.api": {
        authDestination: (user, onboarding) => onboarding && user.role === "mechanic" ? onboardingRoute : "/home",
        loginWithGoogle: async () => { throw new Error("unused"); },
        recoverProviderRegistration: async (credentials) => {
          recoveries.push(credentials);
          return { token: "recovered", user: { role: "mechanic" } };
        },
        linkGoogleAccount: async (...args) => { links.push(args); return { profile, enrollmentTicket: "one-time-ticket" }; },
        enrollProvider: async (body) => {
          enrollments.push(body);
          return { token: "session", user: { role: "mechanic", roles: ["user", "mechanic"] } };
        },
        register: async (body) => {
          requests.push(body);
          if (method === "phone-resume") throw Object.assign(new Error("Phone already registered"), { response: { status: 409 } });
          return { token: "session", user: { role: "mechanic" } };
        }
      },
      "./AuthProvider": { useAuth: () => ({
        setSession() {}, updateUser() {},
        ...(method === "link" ? { token: "customer-session", user: { role: "user", authProvider: "local" } } : {})
      }) },
      "./GoogleSignInOption": { useGoogleSignIn: (_, intent, onDraft, exchange) => {
        assert.equal(intent, "mechanic_register");
        return { googleLoading: false, onGoogleSignIn() {}, onGoogleError() {}, onGoogleCredential: async (token) => {
          const result = exchange ? await exchange(token) : { profile, enrollmentTicket: upgrading ? "one-time-ticket" : undefined };
          onDraft(result.profile, token, result.enrollmentTicket);
        } };
      } },
      "../config/api": { getNetworkErrorMessage: (error) => error.message }
    });
    const wizard = () => { hooks.reset(); return useSignupWizard(); };
    if (method === "link") {
      assert.equal(wizard().googleDisabled, true);
      wizard().setPassword("confirmed-password");
    }
    if (!manual) await wizard().onProviderGoogleCredential("google-id");
    else wizard().choosePhone();
    if (method === "link") assert.deepEqual(links, [["customer-session", "google-id", "confirmed-password"]]);
    if (upgrading) {
      assert.equal(wizard().recognized, true);
      assert.equal(wizard().step, "role");
      assert.equal(enrollments.length, 0);
      wizard().continueAsProvider();
    }
    assert.equal(wizard().step, "service");
    wizard().next();
    assert.equal(wizard().step, "details");
    if (!manual) {
      assert.equal(wizard().name, "Google Provider");
      assert.equal(wizard().needsPassword, false);
    } else {
      wizard().setName("Manual Provider");
      wizard().setPassword("password");
    }
    if (upgrading) {
      assert.equal(wizard().phone, "03001112222");
      assert.equal(wizard().phoneEditable, false);
    } else {
      assert.equal(wizard().canMoveNext, false);
      wizard().setPhone("03001112222");
    }
    wizard().next();
    assert.equal(wizard().step, "documents");
    assert.equal(wizard().canMoveNext, false);
    await wizard().submit();
    assert.equal(requests.length + enrollments.length, 0, "no account before documents and location steps");
    await wizard().pickDocument("workshopPhotoUrl");
    await wizard().pickDocument("certificateUrl");
    wizard().next();
    assert.equal(wizard().step, "location");
    assert.equal(requests.length, 0);
    const create = wizard().submit;
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
  const { useLogin } = load("src/auth/useLogin.ts", {
    "./customerNavigation": navigationHelpers(),
    react: hooks.react,
    "expo-router": { useLocalSearchParams: () => ({}), router: { replace: (route) => routes.push(route) } },
    "./GoogleSignInOption": { useGoogleSignIn: (_, value) => { intent = value; return { googleLoading: false }; } },
    "./AuthProvider": { useAuth: () => ({ setSession: async (...args) => sessions.push(args) }) },
    "./auth.api": {
      authDestination: (user) => user.role === "mechanic" ? "/dashboard" : "/home",
      login: async (body) => { requests.push(body); return { token: "manual-jwt", user: { role: "mechanic" } }; }
    },
    "../config/api": {}
  });
  const login = () => { hooks.reset(); return useLogin(); };
  login().setPhone(" 03001112222 ");
  assert.equal(intent, "customer");
  assert.equal(login().canSubmit, false);
  login().setPassword("password");
  login().chooseAccountType(true);
  const state = login();
  assert.equal(intent, "mechanic_login");
  assert.equal(state.canSubmit, true);
  await Promise.all([state.signInWithPhone(), state.signInWithPhone()]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].phone, "03001112222");
  assert.equal(requests[0].password, "password");
  assert.deepEqual(sessions, [["manual-jwt", { role: "mechanic" }]]);
  assert.deepEqual(routes, ["/dashboard"]);
});

test("account mode switching replaces the session and routes pending providers to verification", async () => {
  const hooks = mockHooks();
  const sessions = [], changes = [], routes = [];
  let activeRole = "user";
  const AccountModeAction = load("src/auth/AccountModeAction.tsx", {
    react: hooks.react,
    "expo-router": { router: { replace: (route) => routes.push(route) } },
    "../config/api": { getNetworkErrorMessage: (error) => error.message },
    "../design/components": { Banner: () => null, Button: () => null },
    "./AuthProvider": { useAuth: () => ({
      token: "signed-session",
      user: { role: activeRole, activeRole, roles: ["user", "mechanic"] },
      setSession: async (token, user) => { sessions.push(token); activeRole = user.activeRole; }
    }) },
    "./auth.api": {
      authDestination: () => "/home",
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
  assert.deepEqual(routes, ["/verification", "/home"]);
});

test("provider onboarding resumes at identity, requires consent and all four photos, then reviews and retries the same submission", async () => {
  const hooks = mockHooks();
  const picked = [], uploads = [], routes = [];
  let status = { reviewState: null, verificationStatus: "pending", submissionId: null };
  const { useVerificationFlow } = load("src/verification/useVerificationFlow.ts", {
    react: { ...hooks.react, useEffect: () => {} },
    "expo-router": { useLocalSearchParams: () => ({ onboarding: "1" }), router: { dismissTo: (route) => routes.push(route) } },
    "react-native": { Platform: { OS: "android" } },
    "./verification": {
      canSubmitVerification: (current) => !current.submissionId,
      verificationPresentation: () => ({ title: "Pending review", tone: "accent", message: "Pending review" })
    },
    "./VerificationProvider": { useVerification: () => ({ status, loading: false, error: null, submitting: false, refresh() {}, submit: async (draft) => {
      uploads.push(draft);
      if (uploads.length === 1) throw new Error("Network unavailable");
      status = { ...status, submissionId: "saved", reviewState: "awaiting_review", matchResult: "mismatch" };
      return true;
    } }) },
    "./verificationImage": { selectVerificationImage: async (source, kind) => {
      picked.push([source, kind]);
      return `${kind}-photo-${picked.length}`;
    } }
  });
  const flow = () => { hooks.reset(); return useVerificationFlow(); };
  assert.equal(flow().step, "identity");
  assert.equal(flow().editing, true);
  assert.equal(flow().progressStep, 3);
  assert.equal(flow().ready, false);
  // Photos are blocked until biometric consent is given.
  await flow().choosePhoto("camera", "profile");
  assert.deepEqual(picked, []);
  flow().toggleConsent();
  await flow().choosePhoto("camera", "profile");
  assert.equal(flow().ready, false);
  await flow().choosePhoto("library", "cnic");
  assert.equal(flow().ready, false, "the two head-turn selfies are still missing");
  await flow().choosePhoto("camera", "profileLeft");
  assert.equal(flow().ready, false);
  await flow().choosePhoto("camera", "profileRight");
  assert.equal(flow().ready, true);
  flow().review();
  assert.equal(flow().reviewing, true);
  assert.equal(flow().progressStep, 4);
  assert.equal(flow().inOnboarding, true);
  flow().backToIdentity();
  await flow().choosePhoto("library", "profile");
  flow().review();
  await flow().submit();
  assert.equal(flow().actionError, "Network unavailable");
  await flow().submit();
  assert.equal(uploads.length, 2);
  assert.equal(uploads[1].profilePhoto, "profile-photo-5");
  assert.equal(uploads[1].profilePhotoLeft, "profileLeft-photo-3");
  assert.equal(uploads[1].profilePhotoRight, "profileRight-photo-4");
  assert.equal(uploads[1].cnicFront, "cnic-photo-2");
  assert.equal(uploads[1].biometricConsent, true);
  assert.equal(flow().awaitingReview, true);
  assert.equal(flow().status.matchResult, "mismatch");
  assert.equal(flow().editing, false);
  flow().toDashboard();
  assert.deepEqual(routes, ["/dashboard"]);
});
