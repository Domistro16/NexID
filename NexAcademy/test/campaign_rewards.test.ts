import { expect } from "chai";
import {
  getCampaignCompletionPoints,
  isGenesisRewardCampaign,
} from "../webapp/lib/campaign-rewards";

describe("campaign reward rules", function () {
  it("does not award Genesis points to internal NexID campaigns", function () {
    const campaign = {
      ownerType: "NEXID",
      contractType: "NEXID_CAMPAIGNS",
      sponsorName: "NexID Core",
      sponsorNamespace: "nexid",
    };

    expect(isGenesisRewardCampaign(campaign)).to.equal(false);
    expect(getCampaignCompletionPoints(campaign)).to.equal(0);
  });

  it("awards Genesis points to partner campaigns tied to NexID", function () {
    const campaign = {
      ownerType: "PARTNER",
      contractType: "PARTNER_CAMPAIGNS",
      sponsorName: "NexID Genesis",
      sponsorNamespace: "genesis",
    };

    expect(isGenesisRewardCampaign(campaign)).to.equal(true);
    expect(getCampaignCompletionPoints(campaign)).to.equal(100);
  });

  it("does not award Genesis points to non-NexID partner campaigns", function () {
    const campaign = {
      ownerType: "PARTNER",
      contractType: "PARTNER_CAMPAIGNS",
      sponsorName: "Partner DAO",
      sponsorNamespace: "partnerdao",
    };

    expect(isGenesisRewardCampaign(campaign)).to.equal(false);
    expect(getCampaignCompletionPoints(campaign)).to.equal(0);
  });
});
