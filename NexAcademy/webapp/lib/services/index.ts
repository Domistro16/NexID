// Re-export all services for easy importing
export { AuthService } from './auth.service';
export { RecommendationService } from './recommendation.service';
export { RelayerService } from './relayer.service';
export { ScormService } from './scorm.service';
export { StorageService, getStorageService } from './storage.service';
export { runPassportScan, getPassportScanner } from './passport-scanner.service';
export { evaluateBadges, getUserBadges, getDisplayBadges, setDisplayBadges, BADGE_META } from './badge-engine.service';
export { getUserMultiplier, getUserMultiplierWithContext } from './multiplier.service';
export { runSybilChecks, hasBlockingSybilFlags, recordFingerprint, dismissSybilFlag } from './sybil-detection.service';
export { isShadowBanned, applyShadowBan, liftShadowBan, flagAiContent } from './shadow-ban.service';
export { checkEngagementIntegrity, analyseHeartbeats, evaluateTabFocus, calculateMouseEntropy } from './engagement-integrity.service';
export { isKilled, activateKillSwitch, deactivateKillSwitch, listActiveKillSwitches, FEATURES } from './kill-switch.service';
export { getPublicProofOfOutcome, getProtocolProofOfOutcome } from './proof-of-outcome.service';
export { requestSession, startSession, completeSession, cancelSession, getUserSessions, getQueueStatus, checkEligibility, expireStaleSessions } from './agent-session.service';
export { submitForVerification, approvePartner, rejectPartner, isPartnerVerified, getPublicPartnerDirectory, listPartnersForReview } from './partner-verification.service';
export { validateCampaignIntake, verifyEscrowFunds, getDifficultyWeight } from './campaign-intake.service';
export { requiresAgentAssessment, hasPassedAssessment } from './claim-gate.service';
export { getCampaignRelayer } from './campaign-relayer.service';
