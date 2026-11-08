# -*- coding: utf-8 -*-
"""PreToolUse guard for this repo's project rules.

Reads the hook payload on stdin, writes a reason to stderr and exits 2 to deny
a tool call. Exit 0 allows it. Every other exit is a hook FAILURE, which the
settings entry pairs with "onFailure": "block" so a broken guard denies rather
than waving work through - a guard that silently stops guarding is worse than
no guard, because it still looks installed.

Four rules, all syntactically checkable from the command text alone. A rule
needing judgement belongs in prose, not here: this file cannot be reasoned with
and cannot be granted an exception in the moment.
"""
import json
import re
import sys


# git takes flags before the subcommand, and -c/-C/--config-env take their
# value as the NEXT token: a blanket (-\S+\s+)* stops matching at
# 'git -c user.name=x commit' and skips the check entirely.
GIT = r'(?:^|[;&|]\s*)\s*git\s+(?:(?:-c|-C|--config-env)\s+\S+\s+|-\S+\s+)*'


def deny(reason):
    sys.stderr.write(reason + "\n")
    sys.exit(2)


# ---------------------------------------------------------------- rule 1
# Agent attribution in a commit message. GitHub parses the trailer and credits
# the named account as a contributor; removing it later means rewriting pushed
# history. The harness asks for these lines every turn, which is exactly why a
# prose rule is not enough on its own.
ATTRIBUTION = [
    (r'(?i)co[-\s]?authored[-\s]?by\s*:', 'a Co-authored-by trailer'),
    (r'(?i)claude[-\s]?session\s*:', 'a Claude-Session line'),
    (r'(?i)generated\s+with\s+\[?claude', 'a "Generated with Claude" line'),
    (r'(?i)\bnoreply@anthropic\.com\b', 'an Anthropic noreply address'),
    (r'\U0001F916', 'the robot emoji used for agent attribution'),
]

# ---------------------------------------------------------------- rule 2
# Absolute system paths in a commit message. They leak the machine layout into
# public history and mean nothing to anyone who clones.
ABS_PATH = [
    (r'(?i)[A-Z]:[\\/]Users[\\/]', 'a Windows user path'),
    (r'(?i)/[a-z]/Users/', 'a Git Bash drive path'),
    (r'(?i)\\\\\\\\[A-Z0-9_.-]+\\\\', 'a UNC network path'),
]

# A commit message arrives via -m/--message, or from a file via -F/--file.
# -F is allowed through unchecked: the content is not in the command text, so
# there is nothing to pattern-match. It is named in the denial reason as the
# clean way to pass a long message.
MSG_FLAG = re.compile(r'(?:^|\s)(?:-m|--message(?:=|\s))')


def check_commit(cmd):
    if not re.search(GIT + r'commit\b', cmd):
        return
    if not MSG_FLAG.search(cmd):
        return
    for pattern, what in ATTRIBUTION:
        if re.search(pattern, cmd):
            deny(
                'Denied: the commit message carries %s.\n'
                'This repo allows no agent attribution of any kind in a commit '
                'message or PR description. GitHub parses the trailer and '
                'credits the account as a contributor, and taking it out later '
                'means rewriting pushed history.\n'
                'Remove the line and commit again.' % what)
    for pattern, what in ABS_PATH:
        if re.search(pattern, cmd):
            deny(
                'Denied: the commit message contains %s.\n'
                'Absolute system paths do not belong in public history - they '
                'leak the machine layout and mean nothing after a clone. Write '
                'the path relative to the repo root.' % what)


# ---------------------------------------------------------------- rule 3
# A push that targets main. Every change goes up as a PR; the Admin role can
# bypass branch protection, which is the only reason a direct push could
# succeed at all, and the bypass existing is not permission to use it.
PUSH = re.compile(GIT + r'push\b')
MAIN_REF = re.compile(
    r'(?:^|\s)(?:\+?(?:refs/heads/)?main(?::\S+)?'       # main, main:x, +main
    r'|HEAD:(?:refs/heads/)?main'                        # HEAD:main
    r'|\S+:(?:refs/heads/)?main)(?=\s|$)')               # anything:main


def check_push(cmd):
    if not PUSH.search(cmd):
        return
    if re.search(r'(?:^|\s)(?:--delete|-d)(?=\s|$)', cmd):
        return  # deleting a ref is a different action; protection covers it
    if MAIN_REF.search(cmd):
        deny(
            'Denied: this push targets main.\n'
            'Every change goes up as a pull request - a frontend fix, a doc, a '
            'one-line typo. main is protected, and the Admin role bypassing '
            'that protection is not permission to use the bypass.\n'
            'Push the feature branch instead and open a PR.')


# ---------------------------------------------------------------- rule 4
# Piping prose through a heredoc. It eats backslash escapes, mangles non-ASCII,
# and dies on an apostrophe or an unbalanced quote - which has silently
# corrupted file writes here more than once. The failure looks like a shell
# error about an unexpected token, so it reads as a typo rather than as a rule.
HEREDOC = re.compile(
    r'<<-?[\'"]?[A-Za-z_][A-Za-z0-9_]*[\'"]?\s*(?:[>|;&]|$)', re.M)


def check_heredoc(cmd):
    if HEREDOC.search(cmd):
        deny(
            'Denied: this command pipes content through a heredoc.\n'
            'A heredoc eats backslash escapes, mangles non-ASCII, and dies on '
            'an apostrophe or an unbalanced quote in prose - and it fails as a '
            'shell syntax error, so it reads as a typo instead of a rule.\n'
            'Write the file with the Write tool, or run a script file.')


def main():
    raw = sys.stdin.read()
    payload = json.loads(raw)
    if payload.get('tool_name') not in ('Bash', 'PowerShell'):
        return
    cmd = payload.get('tool_input', {}).get('command')
    if not isinstance(cmd, str):
        return
    check_commit(cmd)
    check_push(cmd)
    check_heredoc(cmd)


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # fail CLOSED - an unreadable payload is a denial
        sys.stderr.write(
            'Denied: the project guard could not read this tool call (%s: %s). '
            'Failing closed, because a guard that cannot check a command must '
            'not wave it through.\n' % (type(exc).__name__, exc))
        sys.exit(2)
