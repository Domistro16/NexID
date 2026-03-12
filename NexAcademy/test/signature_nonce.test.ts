import { expect } from 'chai';
import { Wallet } from 'ethers';
import {
  buildClaimSignatureMessage,
  NonceReplayGuard,
  verifyClaimSignature,
} from '../webapp/lib/scorm/claim-signature';

describe('Signature verification and nonce replay guard', function () {
  it('verifies a valid claim signature', async function () {
    const wallet = Wallet.createRandom();
    const nonce = 'nonce-123';
    const courseId = 7;
    const timestamp = Math.floor(Date.now() / 1000);

    const message = buildClaimSignatureMessage({
      walletAddress: wallet.address,
      courseId,
      nonce,
      timestamp,
    });

    const signature = await wallet.signMessage(message);
    const result = verifyClaimSignature({
      walletAddress: wallet.address,
      courseId,
      expectedNonce: nonce,
      message,
      signature,
    });

    expect(result.valid).to.equal(true);
  });

  it('rejects nonce replay in guard', function () {
    const guard = new NonceReplayGuard();
    expect(guard.consume('abc')).to.equal(true);
    expect(guard.consume('abc')).to.equal(false);
  });

  it('rejects invalid nonce in signed message', async function () {
    const wallet = Wallet.createRandom();
    const courseId = 2;
    const timestamp = Math.floor(Date.now() / 1000);

    const message = buildClaimSignatureMessage({
      walletAddress: wallet.address,
      courseId,
      nonce: 'nonce-a',
      timestamp,
    });

    const signature = await wallet.signMessage(message);
    const result = verifyClaimSignature({
      walletAddress: wallet.address,
      courseId,
      expectedNonce: 'nonce-b',
      message,
      signature,
    });

    expect(result.valid).to.equal(false);
  });
});

