# Authentication Module — Code Review & Issues

## Architectural & Design Observations

1. **Better Auth Plugins (Passkeys / 2FA)**:
   - `BACKEND.md` §5 recommends implementing the Passkeys plugin (`passkey()`) for Face ID/fingerprint login on mobile devices, and the 2FA (`twoFactor()`) plugin.
   - _Observation_: Currently, only standard `emailAndPassword` authentication is configured.
