# Welcome Bonus (5 Free Coins)

Every new customer automatically receives a one-time welcome bonus of 5 free coins after verifying their email.

## How it works

- Bonus is applied on OTP verification (`POST /api/auth/verify-otp`).
- Coins are credited without affecting `coins.totalPurchased`.
- Audit trail is stored in `coins.awardHistory` with type `welcome`.
- Idempotent: A flag `coins.welcomeBonusGranted` prevents duplicate awards.

## Schema additions

User.coins now includes:

```
welcomeBonusGranted: Boolean
lastAwardDate: Date
awardHistory: [ { date, amount, type, note } ]
```

## Helper methods

- `user.grantFreeCoins(amount, { type, note })`: Generic free award.
- `user.grantWelcomeBonus(amount = 5)`: One-time 5-coin bonus.

## Testing

Run the local test to verify idempotency and balances:

```powershell
cd backend/api-Hetasinglar
node test-welcome-bonus.js
```

Run the comprehensive requirements test:

```powershell
cd backend/api-Hetasinglar
node test-requirements.js
```

## Notes

- Existing users won’t get the bonus retroactively unless triggered manually.
- This behavior is safe and won’t break users missing the new fields (Mongoose defaults apply).
 - Bonus is granted post email verification to avoid rewarding unverified accounts.
 - Bonus coins do not affect `totalPurchased`; they’re tracked in `awardHistory` with `type=welcome`.
 - Idempotency ensured via `coins.welcomeBonusGranted` flag.
 - Backward compatible: new fields are optional and defaulted; no migration required.
