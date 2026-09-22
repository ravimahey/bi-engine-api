# Frontend Auth Integration Guide


How authentication actually works in `ordara-analytics-backend`, and how to
wire a frontend up to it correctly. Read this before building login/signup UI,
route guards, or an axios/fetch client — most integration bugs (silent 401s,
CORS failures, "why does refresh not work") come from skipping one of the
details below.


**Audience:** any frontend engineer integrating with this API, or any backend
engineer touching `src/modules/auth`.


---


## Contents


1. [The model in one paragraph](#1-the-model-in-one-paragraph)
2. [Why cookies, not localStorage](#2-why-cookies-not-localstorage)
3. [The two tokens](#3-the-two-tokens)
4. [Endpoint reference](#4-endpoint-reference)
5. [Request flows](#5-request-flows)
6. [Frontend setup checklist](#6-frontend-setup-checklist)
7. [Reference client code](#7-reference-client-code)
8. [Environment variables that affect auth](#8-environment-variables-that-affect-auth)
9. [Gotchas and FAQ](#9-gotchas-and-faq)
10. [Troubleshooting](#10-troubleshooting)


---


## 1. The model in one paragraph


This is **JWT auth delivered over httpOnly cookies**, with a rotating
access/refresh pair. It is *not* classic server-side session auth (no session
store, no session ID) and it is *not* the naive "JWT in localStorage +
`Authorization` header" pattern either. The server stays stateless (identity
is fully encoded in the signed JWT), while the token transport is a cookie
that frontend JavaScript can never read or touch — the browser attaches it
automatically on every request. A short-lived **access token** (15 min)
authorizes normal API calls; a long-lived **refresh token** (7 days), scoped
only to the auth endpoints, is exchanged for a new pair when the access token
expires. The refresh token is additionally checked against a hash stored in
the database, which is how the server can revoke it (logout, password change,
reuse-detection) despite being otherwise stateless.


---


## 2. Why cookies, not localStorage


| | JWT in localStorage | JWT in httpOnly cookie (this project) |
|---|---|---|
| Readable by frontend JS | Yes — you must manually attach it | No — browser attaches it automatically |
| Vulnerable to XSS token theft | Yes, any injected script can read it | No, `httpOnly` blocks `document.cookie` access |
| Needs manual "attach to every request" code | Yes | No — just `credentials: 'include'` / `withCredentials: true` once |
| Vulnerable to CSRF | No (not a cookie) | Mitigated here via `SameSite` + CORS origin allowlist (see §9) |


**Practical consequence:** your frontend never sees, stores, decodes, or
manually attaches the access/refresh token. There is nothing to put in
Redux/Zustand/localStorage except the *user object* you get back from
`/auth/me` or from a login response. If you find yourself trying to read a
token out of a cookie or response body, stop — that token was intentionally
not given to you.


---


## 3. The two tokens


Both are JWTs signed with the same payload shape
(`src/modules/auth/interfaces/jwt-payload.interface.ts`):


```ts
{ sub: userId, email, role }
```


| | Access token | Refresh token |
|---|---|---|
| Cookie name | `access_token` | `refresh_token` |
| Signing secret | `JWT_ACCESS_SECRET` | `JWT_REFRESH_SECRET` (different key) |
| Lifetime (default) | `JWT_ACCESS_EXPIRES_IN` = **15m** | `JWT_REFRESH_EXPIRES_IN` = **7d** |
| Cookie `path` | `/` — sent on every request | `/api/v1/auth` only — sent only to auth routes |
| Accepted from | cookie **or** `Authorization: Bearer <token>` header | cookie **only**, never a header |
| Server-side revocation | none — purely expires | yes, via a hash stored on the user row |


Two different secrets mean a stolen access token can't be replayed as a
refresh token. Scoping the refresh cookie's path to `/api/v1/auth` means the
longer-lived, more dangerous token isn't attached to ordinary API calls —
only to `POST /auth/refresh` and `POST /auth/logout`.


The `Authorization: Bearer` fallback on the access token exists only for
non-browser clients (Swagger UI, Postman, server-to-server calls, mobile
apps that can't rely on cookies) — a web frontend should never use it, use
the cookie.


---


## 4. Endpoint reference


All routes are prefixed `/api/v1` (`apiPrefix` + versioning from
`src/config/app.config.ts`). `@Public()` routes skip the global auth guard;
everything else requires a valid `access_token`.


| Method | Path | Public? | Body | Notes |
|---|---|---|---|---|
| POST | `/auth/signup` | ✅ | `{ email, password, firstName, lastName, role }` | Sets cookies, returns `User` |
| POST | `/auth/login` | ✅ | `{ email, password }` | Sets cookies, returns `User` |
| POST | `/auth/refresh` | ✅ (needs `refresh_token` cookie) | — | Rotates both tokens, returns `User` |
| POST | `/auth/logout` | ❌ | — | Revokes refresh token, clears cookies |
| GET | `/auth/me` | ❌ | — | Returns the signed-in `User` |
| PATCH | `/auth/profile` | ❌ | `{ firstName?, lastName?, ... }` | Updates own profile |
| PATCH | `/auth/change-password` | ❌ | `{ oldPassword, newPassword }` | Also revokes refresh token (forces re-login) |
| POST | `/auth/forgot-password` | ✅ | `{ email }` | Always 200, even for unknown email — never leaks whether an email is registered |
| POST | `/auth/reset-password` | ✅ | `{ email, otp, newPassword }` | Also revokes refresh token |
| GET | `/auth/google?role=buyer\|supplier` | ✅ | — | **Full browser redirect**, not an XHR/fetch call |
| GET | `/auth/google/callback` | ✅ | — | Google → backend; backend sets cookies then redirects to `${FRONTEND_URL}/auth/callback` (or `/auth/login?error=google_auth_failed`) |
| POST | `/auth/google/token` | ✅ | `{ idToken, role? }` | **Google ID-token login** (Google Identity Services `credential`). Verified against `GOOGLE_CLIENT_ID`; sets the same cookies as `/auth/login` and returns the user. `401` for an invalid/expired/wrong-client token. Use this instead of the redirect flow when the FE renders the Google button itself. |


Every response body follows the project's standard envelope (see
`ResponseMessage` decorator / global interceptor) — the `User` object comes
back as `data`, never the tokens.


---


## 5. Request flows


### 5.1 Login / signup


```
FE                                    BE
|--- POST /auth/login {email,pw} --->|
|                                    | verify credentials
|                                    | sign access+refresh JWT
|                                    | hash(refresh) -> users.hashedRefreshToken
|<-- Set-Cookie: access_token -------|
|<-- Set-Cookie: refresh_token ------|
|<-- 200 { data: User } -------------|
```
Store the returned `User` in app state. Do not look for a token anywhere in
this response — there isn't one to find.


### 5.2 An ordinary authenticated request


```
FE                                    BE
|--- GET /orders (cookie attached) ->|
|                                    | JwtAuthGuard -> 'jwt' strategy
|                                    | reads access_token cookie, verifies
|                                    | req.user = { id, email, role }
|<-- 200 { data: [...] } ------------|
```
This requires the request to actually carry cookies — see §6.


### 5.3 Access token expired → refresh


```
FE                                    BE
|--- GET /orders ------------------->|
|<-- 401 Unauthorized ----------------|
|--- POST /auth/refresh (cookie) --->|
|                                    | verify refresh_token JWT
|                                    | hash(presented) == users.hashedRefreshToken ?
|                                    |   yes -> rotate: new access+refresh, new hash stored
|                                    |   no  -> null out hash, 401 (forces full re-login)
|<-- Set-Cookie: access_token -------|
|<-- Set-Cookie: refresh_token ------|
|<-- 200 { data: User } -------------|
|--- GET /orders (retry) ----------->|
|<-- 200 { data: [...] } ------------|
```
Your frontend should implement this as a **401 interceptor**, not a timer —
see §7 for the exact pattern.


### 5.4 Logout


```
FE                                    BE
|--- POST /auth/logout ------------->|
|                                    | users.hashedRefreshToken = null
|<-- clearCookie access_token -------|
|<-- clearCookie refresh_token ------|
|<-- 200 -----------------------------|
```
After this, clear the `User` from app state and redirect to login. Both
cookies are gone, so any further protected call correctly 401s.


### 5.5 Google OAuth


This is a **redirect flow, not an API call**. Do not `fetch()` or `axios()`
these endpoints.


```
FE (browser nav)                Google                BE
window.location.href =
/auth/google?role=buyer  ----------------------------->|
                                                       redirect to Google
                         <---------------------------- |
                         user consents
                         ------------------------------>|
                                             /auth/google/callback
                                             creates/finds user,
                                             sets cookies
                         <---------------------------------------|
                         redirect to FRONTEND_URL/auth/callback
```
Your `/auth/callback` frontend route needs no query-param parsing — it just
calls `GET /auth/me` on mount (cookies are already set) to load the user and
then routes into the app. On failure it redirects to
`/auth/login?error=google_auth_failed` instead — check for that query param
to show an error toast.


---


## 6. Frontend setup checklist


1. **Send credentials on every request.**
  - `fetch(url, { credentials: 'include' })`
  - axios: create one shared instance with `withCredentials: true` — don't
    rely on setting it per-call, you will forget somewhere.
2. **Never store the access/refresh token yourself.** They're httpOnly —
  your JS literally cannot read them (`document.cookie` won't show them
  either). The only thing to persist in app state is the `User` object.
3. **Your dev origin must be in `CORS_ORIGINS`** on the backend (currently
  `http://localhost:3001` in `.env`). CORS is already configured with
  `credentials: true` in `src/main.ts` — but that only works with an exact
  origin allowlist, never `*`, so make sure your dev server's origin is
  actually listed.
4. **Implement a 401 → refresh → retry interceptor** (§7). Don't try to
  preemptively refresh on a timer against the 15-minute expiry — react to
  the actual 401.
5. **Treat `GET /auth/me` as your "who am I / am I logged in" check** on app
  boot — e.g. to decide whether to show the app shell or the login page.
  There is no client-side way to check auth state (no readable token), so
  this is the source of truth.
6. **Google sign-in is a full navigation**, not a fetch call (§5.5).
7. Expect **one active session per user**, not per device (§9) — plan your
  UX copy accordingly.


---


## 7. Reference client code


### Axios instance with auto-refresh


```ts
// api/client.ts
import axios from 'axios';


export const api = axios.create({
 baseURL: import.meta.env.VITE_API_URL, // e.g. http://localhost:3000/api/v1
 withCredentials: true, // <-- required: sends/receives the auth cookies
});


let refreshInFlight: Promise<unknown> | null = null;


api.interceptors.response.use(
 (res) => res,
 async (error) => {
   const { config, response } = error;
   const isAuthRoute = config?.url?.startsWith('/auth/');


   if (response?.status === 401 && !config._retried && !isAuthRoute) {
     config._retried = true;
     try {
       // Coalesce concurrent 401s into a single refresh call.
       refreshInFlight ??= api.post('/auth/refresh').finally(() => {
         refreshInFlight = null;
       });
       await refreshInFlight;
       return api(config); // retry the original request
     } catch {
       // Refresh itself failed -> session is truly over.
       window.location.href = '/auth/login';
       return Promise.reject(error);
     }
   }


   return Promise.reject(error);
 },
);
```


### Auth context (React example)


```tsx
// auth/AuthProvider.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';


interface User {
 id: string;
 email: string;
 role: 'buyer' | 'supplier' | 'admin';
 firstName: string;
 lastName: string;
}


const AuthContext = createContext<{
 user: User | null;
 loading: boolean;
 login: (email: string, password: string) => Promise<void>;
 logout: () => Promise<void>;
} | null>(null);


export function AuthProvider({ children }: { children: React.ReactNode }) {
 const [user, setUser] = useState<User | null>(null);
 const [loading, setLoading] = useState(true);


 useEffect(() => {
   api
     .get('/auth/me')
     .then(({ data }) => setUser(data.data))
     .catch(() => setUser(null))
     .finally(() => setLoading(false));
 }, []);


 const login = async (email: string, password: string) => {
   const { data } = await api.post('/auth/login', { email, password });
   setUser(data.data);
 };


 const logout = async () => {
   await api.post('/auth/logout');
   setUser(null);
 };


 return (
   <AuthContext.Provider value={{ user, loading, login, logout }}>
     {children}
   </AuthContext.Provider>
 );
}


export const useAuth = () => {
 const ctx = useContext(AuthContext);
 if (!ctx) throw new Error('useAuth must be used within AuthProvider');
 return ctx;
};
```


### Route guard


```tsx
// auth/RequireAuth.tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';


export function RequireAuth({ children }: { children: React.ReactNode }) {
 const { user, loading } = useAuth();
 if (loading) return <Spinner />;
 if (!user) return <Navigate to="/auth/login" replace />;
 return <>{children}</>;
}
```


### Google sign-in button


```tsx
<button
 onClick={() => {
   window.location.href = `${import.meta.env.VITE_API_URL}/auth/google?role=buyer`;
 }}
>
 Continue with Google
</button>
```


### `/auth/callback` page


```tsx
// pages/AuthCallback.tsx
export function AuthCallbackPage() {
 const navigate = useNavigate();
 const { user, loading } = useAuth(); // AuthProvider already re-checks /auth/me


 useEffect(() => {
   if (!loading) navigate(user ? '/dashboard' : '/auth/login');
 }, [loading, user]);


 return <Spinner />;
}
```


---


## 8. Environment variables that affect auth


Set on the **backend**; frontend only needs to know its own API base URL and
match `CORS_ORIGINS`.


| Variable | Purpose | Local dev example |
|---|---|---|
| `JWT_ACCESS_SECRET` | signs access tokens | (secret) |
| `JWT_REFRESH_SECRET` | signs refresh tokens (must differ from access) | (secret) |
| `JWT_ACCESS_EXPIRES_IN` | access token lifetime | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | refresh token lifetime | `7d` |
| `CORS_ORIGINS` | comma-separated allowlist of FE origins | `http://localhost:3001` |
| `FRONTEND_URL` | where Google OAuth redirects after login | `http://localhost:3001` |
| `COOKIE_DOMAIN` | cookie `Domain` attribute; blank locally, e.g. `.ordara.com` in prod for cross-subdomain FE/API | *(empty)* |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | Google OAuth app credentials | — |
| `OTP_EXPIRES_MINUTES` | forgot-password OTP validity | `15` |


In production, `secure: true` and `sameSite: 'none'` are applied
automatically to both cookies (see `src/common/utils/cookie.util.ts`) so
cross-subdomain deployments (`api.ordara.com` ↔ `app.ordara.com`) work —
this requires HTTPS everywhere and a correctly set `COOKIE_DOMAIN`.


---


## 9. Gotchas and FAQ


**"Why did my second login on another tab/device log out my first one?"**
The server stores exactly **one** `hashedRefreshToken` per user row (not a
table of sessions per device). Logging in anywhere overwrites it. The other
session's access token keeps working until it naturally expires (≤15 min),
but its next `/auth/refresh` call will fail, forcing a re-login there. Same
thing happens on `change-password` and `reset-password` — both explicitly
revoke the refresh token to kill other sessions. Design your UX with this in
mind; this is not a multi-device-session system.


**"Can I read the user's role/id on the frontend without calling the API?"**
No, and don't try to decode the JWT client-side even if you could get at it
— it's httpOnly specifically to prevent that. Always get identity from
`GET /auth/me`.


**"Do I need to send a CSRF token?"**
No CSRF token is implemented. Protection instead relies on the CORS origin
allowlist (`credentials: true` + explicit `CORS_ORIGINS`, never `*`) and
`SameSite` cookie attributes. If a future requirement needs a wider
`CORS_ORIGINS` (e.g. `*`) or a non-browser client with elevated privileges,
revisit this — it wasn't designed for that.


**"Why does Swagger UI's 'Authorize' button work with a Bearer token, but my browser fetch doesn't need one?"**
Swagger isn't a browser context with cookies attached the same way, so the
access strategy supports the `Authorization: Bearer <token>` fallback for
tools like it. A real frontend app should rely purely on the cookie and never
handle a raw token string at all.


**"The refresh endpoint is `@Public()` — is that a hole?"**
No — `@Public()` here just means it's exempt from the *access-token* guard.
It's separately protected by `JwtRefreshGuard`, which requires a valid,
un-reused `refresh_token` cookie. "Public" = "doesn't need an access token",
not "unauthenticated".


**"What happens if a refresh token is stolen and used?"**
Whoever uses it first gets a new pair (rotation) and the old refresh token
is now invalid. If the legitimate owner tries to use their (now stale) copy,
the mismatch clears the stored hash entirely — both parties are logged out
and must fully re-authenticate. This is intentional reuse-detection, not a
bug.


---


## 10. Troubleshooting


| Symptom | Likely cause |
|---|---|
| Every request 401s immediately, even right after login | `withCredentials` / `credentials: 'include'` missing on the client |
| Login works but `/auth/me` right after 401s | Cookies not being sent — check CORS: origin must be in `CORS_ORIGINS`, not `*`, and `credentials: true` on both sides |
| Works on `localhost` but not in prod | Missing/incorrect `COOKIE_DOMAIN`, or FE/BE not both on HTTPS (required once `sameSite: 'none'` kicks in) |
| Refresh loop / infinite retries | Interceptor retrying `/auth/refresh` itself on its own 401 — exclude auth routes from the retry logic (see reference code) |
| Logged out after ~15 min even though refresh should've kicked in | No 401 interceptor implemented, or refresh cookie's `path` (`/api/v1/auth`) doesn't match the actual API prefix in your env |
| Logged in on device A unexpectedly logged out after logging in on device B | Expected — see single-session gotcha above |
| Google login redirects back to FE but user appears logged out | `/auth/callback` page not calling `/auth/me` (or calling it without `credentials: 'include'`) |


