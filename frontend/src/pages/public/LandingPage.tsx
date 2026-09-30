import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowRight,
  BarChart3,
  CloudRain,
  Cpu,
  Database,
  FileText,
  FlaskConical,
  Landmark,
  Layers,
  Microscope,
  Sparkles,
  Sprout,
  Tractor,
} from 'lucide-react';
import { useAuth } from '../../auth/context';
import s from './public.module.css';

// Static, verifiable facts about the dataset. No API calls on this page.
const FACTS = [
  ['28,242', 'crop records'],
  ['101', 'countries'],
  ['10', 'crops'],
  ['1990–2013', 'years covered'],
];

const FEATURES = [
  {
    icon: Cpu,
    color: 'var(--data-model)',
    title: 'Yield prediction',
    text: 'Enter 14 field conditions and get a predicted yield in kg/ha, a productivity class, a risk rating and plain-language insights.',
  },
  {
    icon: CloudRain,
    color: 'var(--data-water)',
    title: 'Weather impact',
    text: 'Rainfall, temperature, humidity and sunlight scores per region, from the dataset or live from Open-Meteo.',
  },
  {
    icon: Layers,
    color: 'var(--data-soil)',
    title: 'Soil health',
    text: 'pH, moisture and vegetation vigour for each crop, compared against the crop’s optimal pH range.',
  },
  {
    icon: Sparkles,
    color: 'var(--primary)',
    title: 'AI recommendations',
    text: 'Prioritised actions with severity, timing and expected impact, each with the reasoning behind it.',
  },
  {
    icon: FileText,
    color: 'var(--data-temperature)',
    title: 'Analytics & reports',
    text: 'Multi-year yield trends and record comparisons, exportable as CSV for your own analysis.',
  },
  {
    icon: Database,
    color: 'var(--data-vegetation)',
    title: 'Dataset explorer',
    text: 'Search, filter and inspect every record, then send any row straight to the predictor.',
  },
];

const PIPELINE = [
  ['Collect', 'Historical yields from FAOSTAT via Kaggle, plus live weather.'],
  ['Clean', 'Deduplicate, fix types and handle missing values.'],
  ['Analyze', 'Distributions, crop rankings and factor relationships.'],
  ['Predict', 'A tuned Random Forest estimates yield from 14 inputs.'],
  ['Act', 'Recommendations turn predictions into field actions.'],
];

const AUDIENCE = [
  { icon: Tractor, title: 'Farmers', text: 'Plan the season with yield estimates and clear next steps.' },
  { icon: FlaskConical, title: 'Agronomists', text: 'Explore the data, compare crops and check model performance.' },
  { icon: Microscope, title: 'Researchers', text: 'Inspect records and export filtered data for further study.' },
  {
    icon: Landmark,
    title: 'Agriculture departments',
    text: 'Compare regions and crops to target support where it matters.',
  },
];

const FAQ = [
  [
    'Where does the data come from?',
    'Crop yields come from FAOSTAT (published on Kaggle) for 101 countries and 10 crops between 1990 and 2013. Live weather comes from the Open-Meteo API.',
  ],
  [
    'How accurate are the predictions?',
    'Each prediction shows the model it came from. Agronomists and administrators can see the full model comparison, including R², RMSE and MAE on a held-out test set.',
  ],
  [
    'Do I need to install anything?',
    'No. YieldSense runs in the browser. Sign in with your account or try one of the demo accounts.',
  ],
  [
    'What can each role see?',
    'Farmers get predictions, weather, soil, recommendations and reports. Agronomists also get EDA, the dataset explorer and model performance. Administrators have full access.',
  ],
  ['Can I export my data?', 'Yes. Reports and dataset views can be exported as CSV.'],
];

function Brand() {
  return (
    <Link to="/" className={s.brandTop} aria-label="YieldSense AI home">
      <span className={s.logo}>
        <Sprout size={20} aria-hidden="true" />
      </span>
      <span>
        YieldSense <span>AI</span>
      </span>
    </Link>
  );
}

function PrimaryLink({ to, children, big }: { to: string; children: React.ReactNode; big?: boolean }) {
  return (
    <Link
      to={to}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        height: big ? 48 : 36,
        padding: `0 ${big ? 'var(--space-6)' : 'var(--space-4)'}`,
        borderRadius: 'var(--radius-sm)',
        background: 'var(--primary)',
        color: 'var(--primary-ink)',
        fontWeight: 'var(--weight-semibold)',
        fontSize: big ? 'var(--text-lg)' : 'var(--text-md)',
        textDecoration: 'none',
      }}
    >
      {children}
    </Link>
  );
}

function SecondaryLink({ to, children, big }: { to: string; children: React.ReactNode; big?: boolean }) {
  return (
    <Link
      to={to}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        height: big ? 48 : 36,
        padding: `0 ${big ? 'var(--space-6)' : 'var(--space-4)'}`,
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-strong)',
        background: 'var(--surface)',
        color: 'var(--ink)',
        fontWeight: 'var(--weight-medium)',
        fontSize: big ? 'var(--text-lg)' : 'var(--text-md)',
        textDecoration: 'none',
      }}
    >
      {children}
    </Link>
  );
}

/** Static product preview built from the real visual language. */
function Preview() {
  const bars = [
    ['Potato', 100],
    ['Cassava', 75],
    ['Sweet Potato', 60],
    ['Yams', 57],
    ['Plantains', 53],
  ] as const;
  return (
    <div className={s.browser} aria-hidden="true">
      <div className={s.browserBar}>
        <i />
        <i />
        <i />
        <span className={s.browserUrl}>yieldsense.ai/app/dashboard</span>
      </div>
      <div className={s.browserBody}>
        <div className={s.previewKpis}>
          {[
            ['Farm records', '28,242'],
            ['Countries', '101'],
            ['Crops', '10'],
          ].map(([l, v]) => (
            <div key={l} className={s.previewCard}>
              <div className={s.previewLabel}>{l}</div>
              <div className={s.previewValue}>{v}</div>
            </div>
          ))}
        </div>
        <div className={s.previewCard}>
          <div className={s.previewLabel} style={{ marginBottom: 'var(--space-3)' }}>
            Average yield by crop (relative)
          </div>
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {bars.map(([label, pct]) => (
              <div
                key={label}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '96px 1fr',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--muted)',
                }}
              >
                {label}
                <div style={{ height: 10, borderRadius: 'var(--radius-full)', background: 'var(--surface-2)' }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--data-vegetation)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={s.previewCard} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <BarChart3 size={18} color="var(--data-model)" />
          <div style={{ fontSize: 'var(--text-sm)' }}>
            <div style={{ fontWeight: 'var(--weight-semibold)' }}>Predicted yield</div>
            <div style={{ color: 'var(--muted)' }}>Random Forest · 14 inputs</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { status } = useAuth();
  useEffect(() => {
    document.title = 'YieldSense AI · Crop yield intelligence';
  }, []);
  const signedIn = status === 'authenticated';
  return (
    <div className={s.landing}>
      <a href="#main" className="sr-only">
        Skip to content
      </a>
      <header className={s.nav}>
        <div className={s.navInner}>
          <Brand />
          <nav className={s.navLinks} aria-label="Product">
            <a href="#features">Product</a>
            <a href="#how">How it works</a>
            <a href="#sources">Data sources</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className={s.navCtas}>
            {signedIn ? (
              <PrimaryLink to="/app/dashboard">
                Go to dashboard <ArrowRight size={16} aria-hidden="true" />
              </PrimaryLink>
            ) : (
              <>
                <SecondaryLink to="/login">Sign in</SecondaryLink>
                <PrimaryLink to="/register">Get started</PrimaryLink>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main">
        <section className={clsx(s.hero, 'contour-bg')}>
          <div className={clsx(s.container, s.heroGrid)}>
            <div>
              <span className={s.eyebrow}>
                <Sprout size={16} aria-hidden="true" /> Crop yield intelligence
              </span>
              <h1 className={s.heroTitle}>Know your harvest before you plant it.</h1>
              <p className={s.heroSub}>
                Predict crop yields, understand weather and soil conditions, and act on clear recommendations, all in
                one place.
              </p>
              <div className={s.heroCtas}>
                <PrimaryLink to={signedIn ? '/app/dashboard' : '/register'} big>
                  {signedIn ? 'Open dashboard' : 'Get started'} <ArrowRight size={18} aria-hidden="true" />
                </PrimaryLink>
                {!signedIn && (
                  <SecondaryLink to="/login" big>
                    Try a demo
                  </SecondaryLink>
                )}
              </div>
              <dl className={s.facts}>
                {FACTS.map(([v, l]) => (
                  <div key={l} className={s.fact}>
                    <dt className="sr-only">{l}</dt>
                    <dd style={{ margin: 0 }}>
                      <strong>{v}</strong>
                      <span>{l}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <Preview />
          </div>
        </section>

        <section id="sources" className={s.sources} aria-label="Data sources">
          <div className={clsx(s.container, s.sourcesRow)}>
            <span>
              FAOSTAT <small>· crop yields</small>
            </span>
            <span>
              Kaggle <small>· dataset</small>
            </span>
            <span>
              Open-Meteo <small>· live weather</small>
            </span>
          </div>
        </section>

        <section id="features" className={s.section}>
          <div className={s.container}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Everything you need for the season</h2>
              <p className={s.sectionSub}>Six connected tools that share one context: your region and your crop.</p>
            </div>
            <div className={s.featureGrid}>
              {FEATURES.map(f => (
                <article key={f.title} className={s.feature}>
                  <span className={s.featureIcon} style={{ background: 'var(--surface-2)', color: f.color }}>
                    <f.icon size={20} aria-hidden="true" />
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className={s.section} style={{ paddingTop: 0 }}>
          <div className={s.container}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>How it works</h2>
              <p className={s.sectionSub}>From raw records to a decision in the field.</p>
            </div>
            <ol className={s.pipeline} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {PIPELINE.map(([title, text], i) => (
                <li key={title} className={s.pipeStep}>
                  <span className={s.pipeNum}>0{i + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={s.section} style={{ paddingTop: 0 }}>
          <div className={s.container}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Who it’s for</h2>
            </div>
            <div className={s.audience}>
              {AUDIENCE.map(a => (
                <article key={a.title} className={s.feature}>
                  <span
                    className={s.featureIcon}
                    style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
                  >
                    <a.icon size={20} aria-hidden="true" />
                  </span>
                  <h3>{a.title}</h3>
                  <p>{a.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className={s.section} style={{ paddingTop: 0 }}>
          <div className={s.container}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Frequently asked questions</h2>
            </div>
            <div className={s.faq}>
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <div className={s.container}>
          <section className={clsx(s.cta, 'contour-bg')}>
            <h2>Plan your next season with confidence.</h2>
            <p className={s.sectionSub} style={{ marginInline: 'auto', maxWidth: '48ch' }}>
              Create an account in under a minute, or explore with a demo account.
            </p>
            <div className={s.heroCtas} style={{ justifyContent: 'center' }}>
              <PrimaryLink to={signedIn ? '/app/dashboard' : '/register'} big>
                {signedIn ? 'Open dashboard' : 'Get started'}
              </PrimaryLink>
              {!signedIn && (
                <SecondaryLink to="/login" big>
                  Sign in
                </SecondaryLink>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className={s.footer}>
        <div className={clsx(s.container, s.footerGrid)}>
          <div>
            <Brand />
            <p style={{ marginTop: 'var(--space-3)', maxWidth: '36ch' }}>
              Crop yield prediction and agricultural analytics.
            </p>
          </div>
          <div>
            <h2 className={s.footerHeading}>Product</h2>
            <ul>
              <li>
                <a href="#features">Features</a>
              </li>
              <li>
                <a href="#how">How it works</a>
              </li>
              <li>
                <a href="#faq">FAQ</a>
              </li>
            </ul>
          </div>
          <div>
            <h2 className={s.footerHeading}>Data</h2>
            <ul>
              <li>
                <a href="https://www.fao.org/faostat/" target="_blank" rel="noreferrer">
                  FAOSTAT
                </a>
              </li>
              <li>
                <a href="https://www.kaggle.com/" target="_blank" rel="noreferrer">
                  Kaggle
                </a>
              </li>
              <li>
                <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                  Open-Meteo
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h2 className={s.footerHeading}>Account</h2>
            <ul>
              <li>
                <Link to="/login">Sign in</Link>
              </li>
              <li>
                <Link to="/register">Create account</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className={s.container} style={{ marginTop: 'var(--space-8)' }}>
          © {new Date().getFullYear()} YieldSense AI
        </div>
      </footer>
    </div>
  );
}
