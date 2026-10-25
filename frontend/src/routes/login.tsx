import { createFileRoute } from '@tanstack/react-router'
import { PendingAction } from '../components/PendingAction'

export const Route = createFileRoute('/login')({
  component: Login,
})

/**
 * The sign-in screen, and the one place the brand mark appears at size.
 *
 * The mark belongs here rather than on the hero: the hero is a wait
 * being measured, and an image there competes with the font payload on
 * the very load it is apologising for. Here it is the first thing a
 * resident sees of the product and there is nothing else contending.
 *
 * Accounts are created by the society office, not self-registered. A
 * resident who could sign themselves up could claim a flat that is not
 * theirs, and a flat is what the whole identity model hangs on. So the
 * screen offers no "create account" path and says who to ask instead —
 * an empty state that gives direction rather than a dead end.
 *
 * A tenant gets a sub-account under the owner's, so the owner can see
 * what was raised from their flat. That is also arranged by the office.
 *
 * Nothing on this page states a security claim. "Tamper-evident" and
 * the published-record check belong on surfaces that can show the
 * evidence; a reassurance on a login screen is marketing.
 */
function Login() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-space-xl px-space-lg py-space-xl bg-surface">
      <div className="flex flex-col items-center gap-space-lg text-center">
        {/*
         * Explicit width and height: the mark is 240px and reserving
         * the box stops the form below it jumping when the image
         * lands. The alt text describes the product, not the picture —
         * a screen reader user gains nothing from "illustration of
         * hands holding keys".
         */}
        <img
          src="/brand/mark-240.webp"
          srcSet="/brand/mark-120.webp 120w, /brand/mark-240.webp 240w"
          sizes="240px"
          width={240}
          height={240}
          alt="ClearFunds"
          className="block"
          // Above the fold on the first screen a visitor sees, so it is
          // the one image in the product that is not lazy.
          fetchPriority="high"
        />

        <div>
          <h1 className="font-headline-md font-tabular-currency-lg text-tabular-currency-lg font-normal m-0 text-on-surface">
            ClearFunds
          </h1>
          <p className="mt-space-sm mb-0 text-on-surface-variant max-w-[40ch]">
            Your society&rsquo;s accounts, open to every member.
          </p>
        </div>
      </div>

      <form
        className="w-full max-w-[22rem] flex flex-col gap-space-lg"
        /*
         * method="post" although nothing is posted yet.
         *
         * A form with no method defaults to GET-to-self, so if
         * preventDefault is ever removed, throws, or does not run because
         * the handler failed to hydrate, the browser navigates to
         * ?identifier=<phone or email>&flat=<flat>. That puts a
         * resident's identifying details in the URL bar, in browser
         * history, in any proxy log and in the Referer of whatever loads
         * next. POST keeps them in the body on that same accidental path.
         * It costs nothing today and removes the failure mode entirely.
         */
        method="post"
        action=""
        // Stubbed: the session endpoint does not exist. Submitting
        // does nothing rather than appearing to work.
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-space-sm">
          {/*
           * A real label, not a placeholder. A placeholder disappears
           * the moment someone types, which strands anyone who looks
           * away mid-entry.
           */}
          <label htmlFor="cf-login-id" className="font-label-code-sm text-label-code-sm text-on-surface-variant">
            Phone number or email
          </label>
          <input
            id="cf-login-id"
            name="identifier"
            type="text"
            // Not type="tel" or type="email": the field accepts either,
            // and a wrong type gives a keyboard that cannot enter the
            // other one.
            inputMode="text"
            autoComplete="username"
            required
            className="min-h-11 px-space-md border border-outline-variant rounded-sm bg-surface text-on-surface"
          />
        </div>

        <div className="flex flex-col gap-space-sm">
          <label htmlFor="cf-login-flat" className="font-label-code-sm text-label-code-sm text-on-surface-variant">
            Flat number
          </label>
          <input
            id="cf-login-flat"
            name="flat"
            type="text"
            autoComplete="off"
            required
            className="min-h-11 px-space-md border border-outline-variant rounded-sm bg-surface text-on-surface cf-tabular"
          />
        </div>

        <PendingAction className="min-h-11 px-space-lg border border-outline-variant rounded-sm bg-on-surface text-surface font-medium">
          Send me a sign-in code
        </PendingAction>
      </form>

      <p className="m-0 font-label-code-sm text-label-code-sm text-on-surface-variant text-center max-w-[40ch]">
        Accounts are set up by the society office. If you do not have one, or
        you rent and need access under the owner&rsquo;s flat, ask the
        secretary.
      </p>
    </main>
  )
}
