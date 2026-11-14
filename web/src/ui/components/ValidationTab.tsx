/**
 * ValidationTab.tsx - Re-exports ValidationPage for tab and route integration
 */

import React from 'react';
import { Candidate } from '../../data/types';
import { ValidationPage } from './ValidationPage';

interface ValidationTabProps {
  candidates?: Candidate[];
  onBackToFeed?: () => void;
}

export const ValidationTab: React.FC<ValidationTabProps> = ({ candidates = [], onBackToFeed }) => {
  return <ValidationPage candidates={candidates} onBackToFeed={onBackToFeed} />;
};

export default ValidationTab;
