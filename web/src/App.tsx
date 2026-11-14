import React, { useEffect, useState } from 'react';
import { loadCandidates, loadFields } from './data';
import { Candidate, Field } from './data/types';
import { SolarSystemScene } from './scene/SolarSystemScene';
import { Header } from './ui/components/Header';
import { ObjectSidePanel } from './ui/components/ObjectSidePanel';
import { SkyBlinkViewer } from './ui/components/SkyBlinkViewer';
import { TimeBar } from './ui/components/TimeBar';
import { ValidationTab } from './ui/components/ValidationTab';
import { ModelGallery } from './ui/components/ModelGallery';

export const App: React.FC = () => {
  const [fields, setFields] = useState<Field[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string>('field_asteroid_belt');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'3d' | 'blink' | 'validation' | 'gallery'>('3d');
  const [timeEpochRatio, setTimeEpochRatio] = useState<number>(0.0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initData() {
      try {
        setLoading(true);
        const [fieldData, candidateData] = await Promise.all([
          loadFields({ baseUrl: '/data' }),
          loadCandidates({ baseUrl: '/data' }),
        ]);
        setFields(fieldData);
        setCandidates(candidateData);
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
        onChangeTab={setActiveTab}
      />

      {/* Main Content View Switcher */}
      <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
        {activeTab === '3d' && (
          <>
            <SolarSystemScene
              candidates={candidates}
              selectedCandidateId={selectedCandidateId}
              onSelectCandidate={(id) => setSelectedCandidateId(id)}
              timeEpochRatio={timeEpochRatio}
            />

            {/* Object Telemetry Side Panel */}
            <ObjectSidePanel
              candidate={selectedCandidate}
              onClose={() => setSelectedCandidateId(null)}
            />

            {/* Bottom Parallax Time Scrubber Bar */}
            <TimeBar
              timeEpochRatio={timeEpochRatio}
              onChangeTimeRatio={setTimeEpochRatio}
            />
          </>
        )}

        {activeTab === 'blink' && (
          <SkyBlinkViewer
            candidates={candidates}
            selectedCandidateId={selectedCandidateId}
            onSelectCandidate={(id) => setSelectedCandidateId(id)}
          />
        )}

        {activeTab === 'validation' && <ValidationTab candidates={candidates} />}

        {activeTab === 'gallery' && <ModelGallery candidates={candidates} />}
      </div>
    </div>
  );
};

export default App;
