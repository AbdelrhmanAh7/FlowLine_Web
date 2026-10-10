#!/usr/bin/env node
import { backup, recoveryCli } from "./lib/safe-recovery.mjs";
await recoveryCli(backup);
