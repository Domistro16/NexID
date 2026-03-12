// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * User Operation struct
 * @param sender the sender account of this request.
 * @param nonce unique value the sender uses to prevent replay attacks.
 * @param initCode if set, the account contract will be created by this constructor.
 * @param callData the method call to execute on this account.
 * @param accountGasLimits packed gas limits for validation and execution.
 * @param preVerificationGas gas not calculated by the handleOps method, but added to the fee.
 * @param gasFees packed gas fees (maxPriorityFeePerGas, maxFeePerGas).
 * @param paymasterAndData strictly for the Paymaster to use.
 * @param signature sender-verified signature to be used by the account.
 */
struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    bytes32 gasFees;
    bytes paymasterAndData;
    bytes signature;
}

interface IAccount {
    /**
     * Validate user's signature and nonce
     * the entryPoint will make the call to the recipient only if this validation call returns successfully.
     * signature failure should be reported by returning SIG_VALIDATION_FAILED (1).
     * This allows making a "simulation call" without a valid signature
     * Other failures (e.g. nonce mismatch, or invalid signature format) should still revert to signal failure.
     *
     * @dev Must validate caller is the entryPoint.
     *      Must validate the signature and nonce.
     * @param userOp the operation that is about to be executed.
     * @param userOpHash hash of the user's request data. can be used as the basis for signature.
     * @param missingAccountFunds missing funds on the account's deposit in the entrypoint.
     *      This is the minimum amount to transfer to the sender(entryPoint) to be able to make the call.
     *      The excess is left as a deposit in the entrypoint, for future calls.
     *      can be withdrawn anytime using "withdrawTo"
     *      In case there is a paymaster in the request (or the current deposit is high enough), this value will be zero.
     * @return validationData packed validation data.
     *      <20-byte> aggregator - 0 for sig validation
     *      <6-byte> validUntil - 0 for indefinite
     *      <6-byte> validAfter - 0 for immediate
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData);
}
