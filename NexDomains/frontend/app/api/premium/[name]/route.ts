import { NextRequest, NextResponse } from 'next/server'

// Mock premium data - replace with contract reads
const premiumNames = new Map([
    ['trader', { isPremium: true, requiresAuction: true, fixedPrice: '0' }],
    ['defi', { isPremium: true, requiresAuction: true, fixedPrice: '0' }],
    ['alpha', { isPremium: true, requiresAuction: true, fixedPrice: '0' }],
    ['agent', { isPremium: true, requiresAuction: true, fixedPrice: '0' }],
    ['bot', { isPremium: true, requiresAuction: true, fixedPrice: '0' }],
    ['crypto', { isPremium: true, requiresAuction: true, fixedPrice: '0' }],
    ['nft', { isPremium: true, requiresAuction: true, fixedPrice: '0' }],
    ['whale', { isPremium: true, requiresAuction: false, fixedPrice: '1000000000000000000000' }], // $1000 fixed
    ['69', { isPremium: true, requiresAuction: true, fixedPrice: '0' }],
    ['420', { isPremium: true, requiresAuction: true, fixedPrice: '0' }],
])



export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params
    const cleanName = name.toLowerCase().replace('.id', '')

    const info = premiumNames.get(cleanName)

    if (!info) {
        return NextResponse.json({
            name: cleanName,
            isPremium: false,
            requiresAuction: false,
            fixedPrice: '0',
            hasActiveAuction: false,
        })
    }

    // Check for active auction (mock - replace with contract call)
    const hasActiveAuction = ['trader', 'defi', 'alpha'].includes(cleanName)

    return NextResponse.json({
        name: cleanName,
        isPremium: info.isPremium,
        requiresAuction: info.requiresAuction,
        fixedPrice: info.fixedPrice,
        hasActiveAuction,
    })
}
