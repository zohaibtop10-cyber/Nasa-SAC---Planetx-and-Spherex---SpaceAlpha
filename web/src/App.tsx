import React, { useEffect, useState } from 'react';
import { loadCandidates, loadFields, loadReleases } from './data';
import { Candidate, Field, Release } from './data/types';
import { NasaObjectPayload } from './api/fetchNasaObjectWorkflow';
import { SolarSystemScene } from './scene/SolarSystemScene';
import { AboutPage } from './ui/components/AboutPage';
import { DistanceRangeBar } from './ui/components/DistanceRangeBar';
import { FeedPanel } from './ui/components/FeedPanel';
import { Header } from './ui/components/Header';
import { ModelGallery } from './ui/components/ModelGallery';
import { ObjectPage } from './ui/components/ObjectPage';
import { ObjectPanel } from './ui/components/ObjectPanel';
import { ObjectSidePanel } from './ui/components/ObjectSidePanel';
import { SkyBlinkViewer } from './ui/components/SkyBlinkViewer';
import { TimeBar } from './ui/components/TimeBar';
import { ValidationPage } from './ui/components/ValidationPage';

export const App: React.FC = () => {
  const [fields, setFields] = useState<Field[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string>('field_asteroid_belt');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [panelViewMode, setPanelViewMode] = useState<'bento' | 'telemetry'>('bento');
  const [timelineMode, setTimelineMode] = useState<'orbit' | 'parallax'>('orbit');
  const [sliderDay, setSliderDay] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'3d' | 'blink' | 'validation' | 'gallery' | 'about'>('3d');
  const [timeEpochRatio, setTimeEpochRatio] = useState<number>(0.0);
  const [currentScanIndex, setCurrentScanIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // URL Hash Routing (#/object/<id>, #/validation, #/about)
  const [objectRouteId, setObjectRouteId] = useState<string | null>(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#/object/')) {
      return decodeURIComponent(hash.replace('#/object/', '').trim());
    }
    return null;
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/object/')) {
        const id = decodeURIComponent(hash.replace('#/object/', '').trim());
        setObjectRouteId(id);
      } else {
        setObjectRouteId(null);
        if (hash === '#/validation') {
          setActiveTab('validation');
        } else if (hash === '#/about') {
          setActiveTab('about');
        } else if (hash === '#/gallery') {
          setActiveTab('gallery');
        } else if (hash === '#/blink') {
          setActiveTab('blink');
        } else if (hash === '#/' || hash === '#' || hash === '') {
          setActiveTab('3d');
        }
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = (tab: '3d' | 'blink' | 'validation' | 'gallery' | 'about') => {
    setActiveTab(tab);
    setObjectRouteId(null);
    if (tab === '3d') {
      window.location.hash = '#/';
    } else {
      window.location.hash = `#/${tab}`;
    }
  };

  const handleInjectObject = (payload: NasaObjectPayload) => {
    const customId = `OBJ-${payload.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
    const newCandidate: Candidate = {
      id: customId,
      field_id: 'procedural_injected_field',
      release_batch: '2026-CUSTOM',
      positions: [
        { time: new Date().toISOString(), ra: 180.0, dec: 10.0, err: 0.04 },
        { time: new Date(Date.now() + 14400000).toISOString(), ra: 180.03, dec: 10.02, err: 0.04 },
      ],
      verdict: payload.classification === 'planet' ? 'known_object' : 'unknown',
      confidence: 0.99,
      reason_chain: [
        `COMPILED: Procedural 3D model generated from NASA article for ${payload.name}`,
        `CLASSIFICATION: ${payload.classification} [derived]`,
        `TEXTURE: ${payload.renderState?.textureType} | SCALE: ${payload.renderState?.scale}`,
      ],
      match: {
        designation: payload.name,
        catalog: 'NASA Science Solar System',
        body_type: payload.classification,
        separation_arcsec: 0.0,
      },
      colour_index: 1.1,
      simulated: false,
      labels: {
        confidence: 'derived',
        colour_index: 'measured',
        positions: 'measured',
        'positions.ra': 'measured',
        'positions.dec': 'measured',
        'positions.err': 'derived',
        'match.separation_arcsec': 'derived',
      },
      renderState: payload.renderState,
    } as unknown as Candidate;

    setCandidates((prev) => [newCandidate, ...prev.filter((c) => c.id !== customId)]);
    setSelectedCandidateId(customId);
  };

  useEffect(() => {
    async function initData() {
      try {
        setLoading(true);
        const [fieldData, candidateData, releaseData] = await Promise.all([
          loadFields({ baseUrl: '/data' }),
          loadCandidates({ baseUrl: '/data' }),
          loadReleases({ baseUrl: '/data' }),
        ]);
        setFields(fieldData);
        setCandidates(candidateData);
        setReleases(releaseData);
        if (fieldData.length > 0) {
          setSelectedFieldId(fieldData[0].id);
        }
        if (candidateData.length > 0) {
          setSelectedCandidateId(candidateData[0].id);
        }
      } catch (err) {
        console.error('Failed to load mission data:', err);
        setError(err instanceof Error ? err.message : 'Unknown data loading error');
      } finally {
        setLoading(false);
      }
    }

    initData();
  }, []);

  const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId) || null;

  if (loading) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: 'var(--color-bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
          color: 'var(--color-text-1)',
          gap: '12px',
        }}
      >
        <div style={{ color: '#FF6B3D', fontSize: '18px', fontWeight: 700 }}>LIVE SKY</div>
        <div style={{ color: '#71717A', fontSize: '12px' }}>Loading NASA SPHEREx multi-epoch survey catalog...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: 'var(--color-bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
          color: '#EF4444',
          gap: '12px',
          padding: '24px',
        }}
      >
        <div style={{ fontSize: '18px', fontWeight: 700 }}>Data Contract Error</div>
        <div style={{ color: 'var(--color-text-1)', fontSize: '13px', maxWidth: '600px', textAlign: 'center' }}>
          {error}
        </div>
      </div>
    );
  }

  // Object Page Route (#/object/<id>)
  if (objectRouteId) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: 'var(--color-bg)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Header
          fields={fields}
          selectedFieldId={selectedFieldId}
          onSelectField={setSelectedFieldId}
          activeTab={activeTab}
          onChangeTab={handleTabChange}
          latestRelease={releases[0]?.release_batch}
        />
        <ObjectPage
          candidateId={objectRouteId}
          candidates={candidates}
          onBack={() => {
            window.location.hash = '#/';
            setObjectRouteId(null);
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--color-bg)',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Universal Top Header */}
      <Header
        fields={fields}
        selectedFieldId={selectedFieldId}
        onSelectField={setSelectedFieldId}
        activeTab={activeTab}
        onChangeTab={handleTabChange}
        latestRelease={releases[0]?.release_batch}
      />

      {/* Main Content View */}
      <div style={{ flex: 1, position: 'relative', width: '100%', height: 'calc(100vh - 56px)', marginTop: '56px' }}>
        {activeTab === '3d' && (
          <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
            {/* 360 px Feed Panel with hairline border */}
            <FeedPanel
              candidates={candidates}
              selectedCandidateId={selectedCandidateId}
              onSelectCandidate={(id) => {
                setSelectedCandidateId(id);
                setCurrentScanIndex(0);
                setTimeEpochRatio(0.0);
              }}
              onOpenObjectPage={(id) => {
                setSelectedCandidateId(id);
                window.location.hash = `#/object/${id}`;
              }}
            />

            {/* Canvas fills the rest */}
            <div style={{ flex: 1, position: 'relative', height: '100%', overflow: 'hidden' }}>
              <SolarSystemScene
                candidates={candidates}
                selectedCandidateId={selectedCandidateId}
                onSelectCandidate={(id) => {
                  setSelectedCandidateId(id);
                  setCurrentScanIndex(0);
                  setTimeEpochRatio(0.0);
                  setSliderDay(0);
                }}
                timeEpochRatio={timeEpochRatio}
                sliderDay={sliderDay}
              />

              {/* Dynamic Sub-Agent Intelligence Bento Panel / Telemetry */}
              {panelViewMode === 'bento' ? (
                <ObjectPanel
                  activeObject={selectedCandidate}
                  onClose={() => setSelectedCandidateId(null)}
                  onInjectObject={handleInjectObject}
                />
              ) : (
                <ObjectSidePanel
                  candidate={selectedCandidate}
                  onClose={() => setSelectedCandidateId(null)}
                />
              )}

              {/* Panel Mode Switcher Pill */}
              {selectedCandidate && (
                <div
                  style={{
                    position: 'absolute',
                    top: 16,
                    right: 450,
                    zIndex: 30,
                    display: 'flex',
                    gap: 6,
                  }}
                  className="hidden md:flex"
                >
                  <button
                    onClick={() => setPanelViewMode(panelViewMode === 'bento' ? 'telemetry' : 'bento')}
                    className="control"
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      padding: '4px 10px',
                      backgroundColor: 'rgba(17, 17, 19, 0.85)',
                      backdropFilter: 'blur(8px)',
                      borderColor: 'var(--color-hairline)',
                    }}
                    title="Toggle between AI Bento Grid and Raw Telemetry"
                  >
                    View: {panelViewMode === 'bento' ? 'AI Bento Grid' : 'Raw Telemetry'}
                  </button>
                </div>
              )}

              {/* Bottom Timeline Controls */}
              {timelineMode === 'parallax' && selectedCandidate?.distance_range ? (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40 }}>
                  <DistanceRangeBar
                    candidate={selectedCandidate}
                    currentScanIndex={currentScanIndex}
                    onScanIndexChange={(idx) => {
                      setCurrentScanIndex(idx);
                      const total = Math.max(2, selectedCandidate.positions?.length || 2);
                      const ratio = idx / (total - 1);
                      setTimeEpochRatio(ratio);
                      setSliderDay(ratio * 365);
                    }}
                    onReset={() => {
                      setCurrentScanIndex(0);
                      setTimeEpochRatio(0.0);
                      setSliderDay(0);
                    }}
                  />
                </div>
              ) : (
                <TimeBar
                  sliderDay={sliderDay}
                  onChangeDay={(day) => {
                    setSliderDay(day);
                    setTimeEpochRatio(day / 365);
                  }}
                  timeEpochRatio={timeEpochRatio}
                  onChangeTimeRatio={(ratio) => {
                    const r = typeof ratio === 'function' ? ratio(timeEpochRatio) : ratio;
                    setTimeEpochRatio(r);
                    setSliderDay(r * 365);
                  }}
                  activeObjectName={selectedCandidate?.match?.designation || selectedCandidate?.id}
                  onReset={() => {
                    setSliderDay(0);
                    setTimeEpochRatio(0.0);
                  }}
                />
              )}

              {/* Mode Toggle between 365-Day Orbit Timeline & Parallax Scan Stepper */}
              {selectedCandidate?.distance_range && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: timelineMode === 'parallax' ? '92px' : '90px',
                    left: '24px',
                    zIndex: 45,
                    display: 'flex',
                    gap: '6px',
                  }}
                >
                  <button
                    onClick={() => setTimelineMode(timelineMode === 'orbit' ? 'parallax' : 'orbit')}
                    className="control"
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      padding: '3px 8px',
                      backgroundColor: 'rgba(17, 17, 19, 0.9)',
                      backdropFilter: 'blur(8px)',
                      borderColor: 'var(--color-hairline)',
                      color: '#38BDF8',
                    }}
                    title="Toggle timeline mode"
                  >
                    Mode: {timelineMode === 'orbit' ? '365-Day Orbit Timeline' : 'Parallax Step Ruler'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'blink' && (
          <SkyBlinkViewer
            candidates={candidates}
            selectedCandidateId={selectedCandidateId}
            onSelectCandidate={(id) => setSelectedCandidateId(id)}
          />
        )}

        {activeTab === 'validation' && (
          <ValidationPage
            candidates={candidates}
            onBackToFeed={() => handleTabChange('3d')}
          />
        )}

        {activeTab === 'gallery' && <ModelGallery candidates={candidates} />}

        {activeTab === 'about' && (
          <AboutPage onBackToFeed={() => handleTabChange('3d')} />
        )}
      </div>
    </div>
  );
};

export default App;
