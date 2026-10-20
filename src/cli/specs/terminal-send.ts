import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const TERMINAL_SEND_COMMAND_SPEC: CommandSpec = {
  path: ['terminal', 'send'],
  summary: 'Send input to a live terminal',
  usage:
    'orca terminal send [--terminal <handle>] [--text <text>] [--enter] [--interrupt] [--wait-submit <seconds>] [--retry-request <id>] [--json]',
  allowedFlags: [
    ...GLOBAL_FLAGS,
    'terminal',
    'text',
    'enter',
    'interrupt',
    'wait-submit',
    'retry-request'
  ],
  notes: [
    'For a text-plus-Enter agent prompt, the result separates input acceptance from observed submission and turn start.',
    'On a host that supports prompt delivery, an agent prompt is observed for 10 seconds by default; --wait-submit <seconds> changes the wait and --wait-submit 0 opts out.',
    '--wait-submit only observes the accepted prompt; timeout returns the queued/input-accepted receipt and never resends. If an observable agent (claude, codex, antigravity) never reports turn_started, or is blocked on a permission prompt, the receipt is still printed but the exit code is 75. A prompt queued behind a running turn exits 75 too; do not resend it.',
    'After an ambiguous transport failure, reissue the exact command with the reported --retry-request ID. The ID is bound to the prompt payload and exact terminal process incarnation.',
    'Older hosts accept the legacy raw input but report provider old-host and do not offer idempotent retry or submission observation.'
  ]
}
