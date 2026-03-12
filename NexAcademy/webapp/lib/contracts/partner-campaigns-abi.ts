/**
 * ABI for PartnerCampaigns contract — admin (onlyOwner) + view functions.
 * Used by the admin frontend to sign transactions directly with the admin wallet.
 */
export const PARTNER_CAMPAIGNS_ABI = [
    // ============ OWNER-ONLY ADMIN FUNCTIONS ============
    {
        inputs: [{ internalType: "address", name: "_relayer", type: "address" }],
        name: "setRelayer",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            { internalType: "string", name: "_title", type: "string" },
            { internalType: "string", name: "_description", type: "string" },
            { internalType: "string", name: "_category", type: "string" },
            { internalType: "string", name: "_level", type: "string" },
            { internalType: "string", name: "_thumbnailUrl", type: "string" },
            { internalType: "string", name: "_duration", type: "string" },
            { internalType: "uint256", name: "_totalTasks", type: "uint256" },
            { internalType: "address", name: "_sponsor", type: "address" },
            { internalType: "string", name: "_sponsorName", type: "string" },
            { internalType: "string", name: "_sponsorLogo", type: "string" },
            { internalType: "uint256", name: "_prizePool", type: "uint256" },
            { internalType: "uint256", name: "_startTime", type: "uint256" },
            { internalType: "uint256", name: "_endTime", type: "uint256" },
        ],
        name: "createCampaign",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            { internalType: "uint256", name: "_campaignId", type: "uint256" },
            { internalType: "string", name: "_title", type: "string" },
            { internalType: "string", name: "_description", type: "string" },
            { internalType: "string", name: "_category", type: "string" },
            { internalType: "string", name: "_level", type: "string" },
            { internalType: "string", name: "_thumbnailUrl", type: "string" },
            { internalType: "string", name: "_duration", type: "string" },
            { internalType: "uint256", name: "_totalTasks", type: "uint256" },
            { internalType: "address", name: "_sponsor", type: "address" },
            { internalType: "string", name: "_sponsorName", type: "string" },
            { internalType: "string", name: "_sponsorLogo", type: "string" },
            { internalType: "uint256", name: "_prizePool", type: "uint256" },
            { internalType: "uint256", name: "_startTime", type: "uint256" },
            { internalType: "uint256", name: "_endTime", type: "uint256" },
        ],
        name: "updateCampaign",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "uint256", name: "_campaignId", type: "uint256" }],
        name: "deactivateCampaign",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },

    // ============ VIEW FUNCTIONS ============
    {
        inputs: [],
        name: "campaignCounter",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "numCampaigns",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ internalType: "uint256", name: "_campaignId", type: "uint256" }],
        name: "getTotalCampaignPoints",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        name: "totalCampaignPoints",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "owner",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "relayer",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },

    // ============ EVENTS ============
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "uint256", name: "campaignId", type: "uint256" },
            { indexed: false, internalType: "string", name: "title", type: "string" },
            { indexed: true, internalType: "address", name: "sponsor", type: "address" },
        ],
        name: "CampaignCreated",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "uint256", name: "campaignId", type: "uint256" },
            { indexed: false, internalType: "string", name: "title", type: "string" },
        ],
        name: "CampaignUpdated",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "uint256", name: "campaignId", type: "uint256" },
        ],
        name: "CampaignDeactivated",
        type: "event",
    },
] as const;
