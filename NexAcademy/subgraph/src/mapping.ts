import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { PointsAwarded } from "../generated/PartnerCampaignsV2/PartnerCampaigns";
import { UserCampaign, UserTotal, CampaignTotal } from "../generated/schema";

function userCampaignId(user: Bytes, contract: Bytes, campaignId: BigInt): string {
  return user.toHexString() + "-" + contract.toHexString() + "-" + campaignId.toString();
}

function campaignTotalId(contract: Bytes, campaignId: BigInt): string {
  return contract.toHexString() + "-" + campaignId.toString();
}

export function handlePointsAwarded(event: PointsAwarded): void {
  let user = event.params.user;
  let campaignId = event.params.campaignId;
  let totalPoints = event.params.totalPoints;
  let contract = event.address;

  let block = event.block.number;
  let timestamp = event.block.timestamp;

  // ── UserCampaign (per-user per-campaign running total) ──────────────────
  let ucId = userCampaignId(user, contract, campaignId);
  let uc = UserCampaign.load(ucId);

  let previousPoints = BigInt.zero();
  let isNewUserCampaign = false;

  if (uc == null) {
    uc = new UserCampaign(ucId);
    uc.user = user;
    uc.contract = contract;
    uc.campaignId = campaignId;
    uc.points = BigInt.zero();
    isNewUserCampaign = true;
  } else {
    previousPoints = uc.points;
  }

  // Contract emits authoritative running total. Delta is derived, never negative
  // under normal operation; clamp to zero to stay consistent across reorgs.
  let delta = totalPoints.minus(previousPoints);
  if (delta.lt(BigInt.zero())) {
    delta = BigInt.zero();
  }

  uc.points = totalPoints;
  uc.lastUpdatedBlock = block;
  uc.lastUpdatedTimestamp = timestamp;
  uc.save();

  // ── UserTotal (global leaderboard — aggregated across v1 + v2) ──────────
  let userId = user.toHexString();
  let ut = UserTotal.load(userId);
  if (ut == null) {
    ut = new UserTotal(userId);
    ut.totalPoints = BigInt.zero();
    ut.campaignsEntered = 0;
  }

  ut.totalPoints = ut.totalPoints.plus(delta);
  if (isNewUserCampaign) {
    ut.campaignsEntered = ut.campaignsEntered + 1;
  }
  ut.lastUpdatedBlock = block;
  ut.lastUpdatedTimestamp = timestamp;
  ut.save();

  // ── CampaignTotal (per-campaign, namespaced by contract) ────────────────
  let cId = campaignTotalId(contract, campaignId);
  let ct = CampaignTotal.load(cId);
  if (ct == null) {
    ct = new CampaignTotal(cId);
    ct.contract = contract;
    ct.campaignId = campaignId;
    ct.totalPoints = BigInt.zero();
    ct.participantCount = 0;
  }

  ct.totalPoints = ct.totalPoints.plus(delta);
  if (isNewUserCampaign) {
    ct.participantCount = ct.participantCount + 1;
  }
  ct.lastUpdatedBlock = block;
  ct.lastUpdatedTimestamp = timestamp;
  ct.save();
}
