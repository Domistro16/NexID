/**
 * ABI for NexIDCampaigns contract — admin (onlyOwner) + view functions.
 * Used by the admin frontend to sign transactions directly with the admin wallet.
 */
export const NEXID_CAMPAIGNS_ABI = [
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
            { internalType: "string", name: "_longDescription", type: "string" },
            { internalType: "string", name: "_instructor", type: "string" },
            { internalType: "string[]", name: "_objectives", type: "string[]" },
            { internalType: "string[]", name: "_prerequisites", type: "string[]" },
            { internalType: "string", name: "_category", type: "string" },
            { internalType: "string", name: "_level", type: "string" },
            { internalType: "string", name: "_thumbnailUrl", type: "string" },
            { internalType: "string", name: "_duration", type: "string" },
            { internalType: "uint256", name: "_totalLessons", type: "uint256" },
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
            { internalType: "string", name: "_longDescription", type: "string" },
            { internalType: "string", name: "_instructor", type: "string" },
            { internalType: "string[]", name: "_objectives", type: "string[]" },
            { internalType: "string[]", name: "_prerequisites", type: "string[]" },
            { internalType: "string", name: "_category", type: "string" },
            { internalType: "string", name: "_level", type: "string" },
            { internalType: "string", name: "_thumbnailUrl", type: "string" },
            { internalType: "string", name: "_duration", type: "string" },
            { internalType: "uint256", name: "_totalLessons", type: "uint256" },
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
