/** Load env the way Next does: .env.local wins over .env. */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
