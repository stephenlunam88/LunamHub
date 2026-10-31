import { useEffect, type ReactNode } from "react";
import { CalendarDays, CheckSquare2, House, ShieldCheck } from "lucide-react";

const CONTACT_EMAIL = "thelunams@gmail.com";
const LAST_UPDATED = "1 November 2026";

function PublicPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · LunamHub`;
    const existingDescription = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const previousDescription = existingDescription?.content;
    if (existingDescription) existingDescription.content = description;
    return () => {
      document.title = "LunamHub";
      if (existingDescription && previousDescription !== undefined) {
        existingDescription.content = previousDescription;
      }
    };
  }, [description, title]);

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <header className="border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <a href="/about" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <House className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-serif text-xl font-bold">LunamHub</span>
          </a>
          <a
            href="/"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Open app
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-10 max-w-3xl">
          <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            {description}
          </p>
        </div>
        {children}
      </main>

      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-4xl flex-wrap gap-x-6 gap-y-3 px-5 py-6 text-sm text-muted-foreground sm:px-8">
          <a className="hover:text-foreground" href="/about">
            About
          </a>
          <a className="hover:text-foreground" href="/privacy">
            Privacy
          </a>
          <a className="hover:text-foreground" href="/terms">
            Terms
          </a>
          <a className="hover:text-foreground" href={`mailto:${CONTACT_EMAIL}`}>
            Contact
          </a>
        </div>
      </footer>
    </div>
  );
}

export function About() {
  return (
    <PublicPage
      title="One place for family life"
      description="LunamHub is a private household organiser for calendars, chores, todo lists, routines, rewards and the everyday details that keep a family moving."
    >
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: CalendarDays,
            title: "Shared calendar",
            body: "See the household schedule together and optionally synchronise events with Google Calendar.",
          },
          {
            icon: CheckSquare2,
            title: "Tasks and routines",
            body: "Keep chores, todo lists and recurring routines visible and easy to complete.",
          },
          {
            icon: ShieldCheck,
            title: "Private by design",
            body: "Household information stays in the family's self-hosted LunamHub service and is protected by its sign-in.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <article key={title} className="rounded-3xl bg-card p-6 shadow-sm">
            <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
            <h2 className="mt-5 text-lg font-bold">{title}</h2>
            <p className="mt-2 leading-7 text-muted-foreground">{body}</p>
          </article>
        ))}
      </section>

      <section className="mt-10 rounded-3xl border bg-primary/5 p-6 sm:p-8">
        <h2 className="font-serif text-2xl font-bold">
          Google Calendar connection
        </h2>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
          Connecting Google Calendar is optional. When enabled, LunamHub uses
          the access granted by the household administrator only to display and
          synchronise household calendar events. See the privacy policy for full
          details.
        </p>
        <a
          href="/privacy"
          className="mt-5 inline-flex font-semibold text-primary hover:underline"
        >
          Read the privacy policy
        </a>
      </section>
    </PublicPage>
  );
}

function PolicySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b py-7 first:pt-0 last:border-b-0">
      <h2 className="font-serif text-2xl font-bold">{title}</h2>
      <div className="mt-3 space-y-3 leading-7 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export function Privacy() {
  return (
    <PublicPage
      title="Privacy policy"
      description={`How LunamHub handles household and Google Calendar information. Last updated ${LAST_UPDATED}.`}
    >
      <div className="rounded-3xl bg-card p-6 shadow-sm sm:p-9">
        <PolicySection title="Overview">
          <p>
            LunamHub is a private, self-hosted household organiser. It is
            operated for personal family use, not as an advertising or
            data-broker service. The household administrator controls access to
            the application and its optional external connections.
          </p>
        </PolicySection>

        <PolicySection title="Information LunamHub handles">
          <p>
            LunamHub stores information entered by household members, including
            calendar events, family member names, chores, routines, lists,
            rewards and application preferences.
          </p>
          <p>
            If a household administrator connects Google Calendar, LunamHub may
            access and synchronise calendar names, event titles, descriptions,
            dates, times, recurrence details, locations, time zones and Google
            event identifiers. It also stores an OAuth refresh token so the
            connection can continue without repeated sign-in.
          </p>
        </PolicySection>

        <PolicySection title="How Google data is used">
          <p>
            Google Calendar data is used only to display, create, update, delete
            and synchronise calendar events requested through LunamHub. It is
            not used for advertising, profiling, credit decisions or sale to
            third parties.
          </p>
          <p>
            LunamHub's use and transfer of information received from Google APIs
            adheres to the{" "}
            <a
              className="text-primary hover:underline"
              href="https://developers.google.com/terms/api-services-user-data-policy"
              rel="noreferrer"
              target="_blank"
            >
              Google API Services User Data Policy
            </a>
            , including its Limited Use requirements.
          </p>
        </PolicySection>

        <PolicySection title="Storage and sharing">
          <p>
            Household data, synchronised event details and the Google OAuth
            token are stored on the household's private LunamHub server. Data is
            shared with Google only as required to perform requested Calendar
            operations. LunamHub does not sell personal information or share it
            with advertisers.
          </p>
        </PolicySection>

        <PolicySection title="Retention and deletion">
          <p>
            Disconnecting Google Calendar in LunamHub removes the stored OAuth
            token and stops future Google access. Calendar or household records
            already stored in LunamHub remain until they are deleted in the app
            or removed by the household administrator. Google access can also be
            revoked from the connected Google Account's security settings.
          </p>
        </PolicySection>

        <PolicySection title="Security and children">
          <p>
            LunamHub uses access controls and a private server to protect
            household data. No system can guarantee absolute security. LunamHub
            is managed by adults for household use and is not offered as an
            independent online service directed to children.
          </p>
        </PolicySection>

        <PolicySection title="Contact">
          <p>
            For privacy questions or deletion requests, email{" "}
            <a
              className="text-primary hover:underline"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </PolicySection>
      </div>
    </PublicPage>
  );
}

export function Terms() {
  return (
    <PublicPage
      title="Terms of service"
      description={`Terms for using the private LunamHub household service. Last updated ${LAST_UPDATED}.`}
    >
      <div className="rounded-3xl bg-card p-6 shadow-sm sm:p-9">
        <PolicySection title="Personal household service">
          <p>
            LunamHub is provided for authorised members of the household. By
            using it, you agree to use it lawfully and only with information and
            external accounts you are authorised to manage.
          </p>
        </PolicySection>

        <PolicySection title="Accounts and connections">
          <p>
            The household administrator is responsible for protecting access to
            LunamHub and deciding which Google Account or other service is
            connected. External connections are optional and may be disconnected
            at any time.
          </p>
        </PolicySection>

        <PolicySection title="Availability">
          <p>
            LunamHub is supplied on an as-available basis for personal use.
            Features may change, and uninterrupted availability or error-free
            operation is not guaranteed. Important appointments and tasks should
            be confirmed with their original source when necessary.
          </p>
        </PolicySection>

        <PolicySection title="Changes and contact">
          <p>
            These terms may be updated when the service or its integrations
            change. The current version and update date will remain available on
            this page. Questions can be sent to{" "}
            <a
              className="text-primary hover:underline"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </PolicySection>
      </div>
    </PublicPage>
  );
}
