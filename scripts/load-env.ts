// Loads env files the same way Next.js does for scripts/tests: .env.local wins over .env.
// Empty values are ignored so a blank line in .env.local doesn't hide a value from .env.
import { config } from 'dotenv';

for (const file of ['.env.local', '.env']) {
  const parsed = config({ path: file, processEnv: {}, quiet: true }).parsed ?? {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== '' && process.env[key] === undefined) process.env[key] = value;
  }
}
