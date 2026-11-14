/**
 * AboutPage.tsx - Scientific Mission Background, Data Sources, and Methodology (#/about)
 *
 * Implements:
 * - Pipeline architecture summary (detection -> rejection -> linking -> triage -> parallax -> export)
 * - Data sources & formal credits: NASA/IPAC IRSA, NASA JPL, and ESA Gaia
 * - Observational limits and line-of-sight distance ambiguities
 * - The Planet X zone explicitly cited as a theoretical hypothesis (Batygin & Brown 2016/2021)
 * - Zero discovery claims policy
 * - Strict epistemic number labeling (measured, derived, assumed)
 */

import React from 'react';
import { NumberChip } from './NumberChip';

interface AboutPageProps {
  onBackToFeed?: () => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onBackToFeed }) => {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--color-bg)',
        overflowY: 'auto',
        padding: '80px 24px 48px 24px',
        boxSizing: 'border-box',
        color: 'var(--color-text-1)',
      }}
    >
      <div
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '32px',
        }}
      >
        {/* Navigation Breadcrumb */}
        {onBackToFeed && (
          <div>
            <button
              onClick={onBackToFeed}
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#888899',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 0',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>←</span>
              <span>Back to Survey View</span>
            </button>
          </div>
        )}

        {/* Title & Introduction */}
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              padding: '3px 10px',
              borderRadius: '4px',
              marginBottom: '12px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#38BDF8',
              }}
            />
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#38BDF8', fontWeight: 600 }}>
              MISSION ARCHITECTURE &amp; METHODOLOGY
            </span>
          </div>

          <h1
            style={{
              fontFamily: 'monospace',
              fontSize: '26px',
              fontWeight: 700,
              letterSpacing: '-0.5px',
              margin: '0 0 8px 0',
            }}
          >
            About Live Sky: SPHEREx Mover Explorer
          </h1>
          <p
            style={{
              fontFamily: 'monospace',
              fontSize: '13px',
              color: '#888899',
              lineHeight: '1.6',
              margin: 0,
            }}
          >
            An open-science 3D survey visualization tracking infrared transients, moving solar system minor bodies,
            and distant uncataloged outer candidates across NASA SPHEREx multi-epoch sky observations.
          </p>
        </div>

        {/* 1. Pipeline Summary */}
        <section
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-hairline)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#FF6B3D', fontWeight: 700 }}>
              01 // ARCHITECTURE
            </span>
            <h2 style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, margin: 0 }}>
              End-to-End Pipeline Summary
            </h2>
          </div>

          <p style={{ fontFamily: 'monospace', fontSize: '12px', color: '#A1A1AA', lineHeight: '1.6', margin: 0 }}>
            Live Sky separates computationally heavy astronomical ingestion from interactive visualization.
            The Python pipeline (<code>pipeline/</code>) handles all remote data retrieval, astrometric reduction,
            stationary star subtraction, catalog correlation, and reflex parallax calculations, generating verified,
            frozen JSON contracts that the web application renders statically without browser network dependencies.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              marginTop: '4px',
            }}
          >
            {[
              {
                step: 'Step 1: Ingestion',
                mod: 'pipeline/fetch.py',
                desc: 'SPHEREx multi-epoch FITS images fetched and masked via VARIANCE and FLAGS bitmasks.',
              },
              {
                step: 'Step 2: Source Detection',
                mod: 'pipeline/detect.py',
                desc: 'photutils DAOStarFinder detects point sources above 5.0 sigma threshold with WCS mapping.',
              },
              {
                step: 'Step 3: Background Rejection',
                mod: 'pipeline/fixed.py',
                desc: 'Stationary stars (< 2.0 arcsec shift across epochs) rejected from mover pool.',
              },
              {
                step: 'Step 4: Track Linking',
                mod: 'pipeline/link.py',
                desc: 'Multi-epoch detections linked into candidate tracks constrained by physical Keplerian rate limits.',
              },
              {
                step: 'Step 5: Automated Triage',
                mod: 'pipeline/triage.py',
                desc: 'Order: Artifact -> JPL Small-Body Ident -> ESA Gaia DR3 Fast Star -> Unknown Candidate.',
              },
              {
                step: 'Step 6: Reflex Parallax',
                mod: 'pipeline/parallax.py',
                desc: 'Calculates distance bounds [min_au, max_au] from Earth-SPHEREx orbital reflex baseline.',
              },
              {
                step: 'Step 7: Contract Export',
                mod: 'pipeline/export.py',
                desc: 'Validates against JSON schemas and writes immutable catalogs to web/public/data/.',
              },
            ].map((s, idx) => (
              <div
                key={idx}
                style={{
                  backgroundColor: 'var(--color-bg)',
                  border: '1px solid var(--color-hairline)',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  fontFamily: 'monospace',
                }}
              >
                <div style={{ fontSize: '10px', color: '#FF6B3D', fontWeight: 600 }}>{s.step}</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#D4D4D8' }}>{s.mod}</div>
                <div style={{ fontSize: '11px', color: '#71717A', lineHeight: '1.4' }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 2. External Data Sources & Formal Credits */}
        <section
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-hairline)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#38BDF8', fontWeight: 700 }}>
              02 // ATTRIBUTION
            </span>
            <h2 style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, margin: 0 }}>
              Data Sources &amp; Formal Credits
            </h2>
          </div>

          <p style={{ fontFamily: 'monospace', fontSize: '12px', color: '#A1A1AA', lineHeight: '1.6', margin: 0 }}>
            Live Sky is built on open astrometric datasets and public scientific query APIs provided by international
            space agencies and archives:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Source 1: NASA/IPAC IRSA */}
            <div
              style={{
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-hairline)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                fontFamily: 'monospace',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#38BDF8' }}>
                  NASA / IPAC Infrared Science Archive (IRSA)
                </span>
                <span style={{ fontSize: '10px', color: '#10B981', border: '1px solid #10B981', padding: '1px 6px' }}>
                  PRIMARY SURVEY DATA
                </span>
              </div>
              <p style={{ fontSize: '11px', color: '#A1A1AA', lineHeight: '1.5', margin: 0 }}>
                SPHEREx (Spectro-Photometer for the History of the Universe, Epoch of Reionization, and Ices Explorer)
                Quick Release 2 (QR2) all-sky survey data cubes spanning 0.75 &mu;m to 5.0 &mu;m across 102 spectral channels.
                Operated by the California Institute of Technology (Caltech) under contract with NASA.
              </p>
              <div style={{ fontSize: '10px', color: '#71717A' }}>
                Archive Access: <a href="https://irsa.ipac.caltech.edu/" target="_blank" rel="noreferrer" style={{ color: '#38BDF8' }}>https://irsa.ipac.caltech.edu/</a>
              </div>
            </div>

            {/* Source 2: NASA JPL */}
            <div
              style={{
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-hairline)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                fontFamily: 'monospace',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#F59E0B' }}>
                  NASA JPL Solar System Dynamics (SSD)
                </span>
                <span style={{ fontSize: '10px', color: '#F59E0B', border: '1px solid #F59E0B', padding: '1px 6px' }}>
                  MINOR BODY EPHEMERIDES
                </span>
              </div>
              <p style={{ fontSize: '11px', color: '#A1A1AA', lineHeight: '1.5', margin: 0 }}>
                NASA/JPL Small-Body Identification API (<code>sb_ident.api</code>) and Small-Body Database (SBDB),
                providing predicted orbital positions, apparent rates of motion, and visual magnitudes for all cataloged
                asteroids and comets. Maintained by the Jet Propulsion Laboratory (JPL), California Institute of Technology.
              </p>
              <div style={{ fontSize: '10px', color: '#71717A' }}>
                API Endpoint: <a href="https://ssd-api.jpl.nasa.gov/sb_ident.api" target="_blank" rel="noreferrer" style={{ color: '#F59E0B' }}>https://ssd-api.jpl.nasa.gov/sb_ident.api</a>
              </div>
            </div>

            {/* Source 3: ESA Gaia */}
            <div
              style={{
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-hairline)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                fontFamily: 'monospace',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#A78BFA' }}>
                  European Space Agency (ESA) Gaia Mission
                </span>
                <span style={{ fontSize: '10px', color: '#A78BFA', border: '1px solid #A78BFA', padding: '1px 6px' }}>
                  ASTROMETRIC STELLAR CATALOG
                </span>
              </div>
              <p style={{ fontSize: '11px', color: '#A1A1AA', lineHeight: '1.5', margin: 0 }}>
                ESA Gaia Data Release 3 (Gaia DR3) catalog, providing five-parameter astrometry (positions, parallaxes,
                and proper motions) for over 1.4 billion astronomical sources. Proper motions are propagated linearly
                from reference epoch J2016.0 to observation epoch to distinguish fast-moving stars from solar system bodies.
              </p>
              <div style={{ fontSize: '10px', color: '#71717A' }}>
                Gaia Archive: <a href="https://www.cosmos.esa.int/web/gaia/data-release-3" target="_blank" rel="noreferrer" style={{ color: '#A78BFA' }}>https://www.cosmos.esa.int/web/gaia/data-release-3</a>
              </div>
            </div>
          </div>
        </section>

        {/* 3. The Planet X Zone Cited as a Hypothesis */}
        <section
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-hairline)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#FF6B3D', fontWeight: 700 }}>
              03 // HYPOTHESIS &amp; POLICY
            </span>
            <h2 style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, margin: 0 }}>
              The Planet X Zone Cited as a Hypothesis
            </h2>
          </div>

          <div
            style={{
              backgroundColor: 'rgba(255, 107, 61, 0.08)',
              border: '1px solid rgba(255, 107, 61, 0.3)',
              padding: '16px',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#D4D4D8',
              lineHeight: '1.6',
            }}
          >
            <div style={{ color: '#FF6B3D', fontWeight: 700, marginBottom: '6px' }}>
              NON-NEGOTIABLE RULE 3: ZERO DISCOVERY CLAIMS
            </div>
            Live Sky makes <strong>NO claim</strong> of discovering &quot;Planet X&quot; or &quot;Planet Nine&quot;.
            Any 3D orbital shell or region representing this zone is explicitly designated as a <em>theoretical hypothesis</em>,
            and any detected transient in this distance regime is classified strictly as an <code>unknown</code> candidate
            pending multi-epoch orbital verification.
          </div>

          <p style={{ fontFamily: 'monospace', fontSize: '12px', color: '#A1A1AA', lineHeight: '1.6', margin: 0 }}>
            <strong>Scientific Background:</strong> The theoretical hypothesis of a distant, massive solar system planet
            was proposed by astrophysicists Konstantin Batygin and Mike Brown (<em>The Astronomical Journal</em>, 2016, 2021)
            to explain the anomalous orbital clustering of extreme trans-Neptunian objects (eTNOs) with semi-major axes
            exceeding 150 AU and perihelia beyond Neptune&apos;s gravitational reach.
          </p>

          <div
            style={{
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-hairline)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontFamily: 'monospace',
              fontSize: '11px',
            }}
          >
            <div style={{ color: '#71717A', fontWeight: 600 }}>HYPOTHETICAL PARAMETERS (Batygin &amp; Brown 2021):</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <NumberChip prefix="Semimajor Axis Min:" value={400} unit="AU" label="assumed" precision={0} compact />
              <NumberChip prefix="Semimajor Axis Max:" value={800} unit="AU" label="assumed" precision={0} compact />
              <NumberChip prefix="Estimated Mass:" value={6.2} unit="M⊕" label="assumed" precision={1} compact />
              <NumberChip prefix="Inclination:" value={16.0} unit="°" label="assumed" precision={1} compact />
            </div>
          </div>
        </section>

        {/* 4. Observational Limits & Caveats */}
        <section
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-hairline)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#71717A', fontWeight: 700 }}>
              04 // CAVEATS
            </span>
            <h2 style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, margin: 0 }}>
              Observational &amp; Geometric Limits
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'monospace', fontSize: '12px' }}>
            <div>
              <strong style={{ color: '#D4D4D8' }}>Line-of-Sight Distance Ambiguity:</strong>
              <p style={{ color: '#888899', lineHeight: '1.5', margin: '4px 0 0 0' }}>
                With only two observations separated by a short temporal baseline (e.g. 0.2 days), the line-of-sight
                distance cannot be resolved to a point; it forms a geometric segment along the observation vector.
                Subsequent scans are required to shrink the uncertainty bounds through Earth-SPHEREx reflex parallax.
              </p>
            </div>

            <div>
              <strong style={{ color: '#D4D4D8' }}>Photometric SNR Threshold:</strong>
              <p style={{ color: '#888899', lineHeight: '1.5', margin: '4px 0 0 0' }}>
                A strict threshold of 5.0&sigma; is enforced to eliminate noise fluctuations and cosmic-ray transients.
                Faint outer solar system objects below this limit require stacked co-adds across multiple survey scans.
              </p>
            </div>

            <div>
              <strong style={{ color: '#D4D4D8' }}>Dense Field PSF Blending:</strong>
              <p style={{ color: '#888899', lineHeight: '1.5', margin: '4px 0 0 0' }}>
                In regions intersecting the Galactic plane, stellar crowding can introduce centroid shifts between epochs.
                Flagged pixels and variance masks are applied to suppress spurious detections.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AboutPage;
