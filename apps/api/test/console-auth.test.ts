import {
  Account,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { verifySignedChallenge } from "../src/services/console-auth.js";

function challenge(signer: Keypair) {
  const transaction = new TransactionBuilder(
    new Account(signer.publicKey(), "0"),
    { fee: "100", networkPassphrase: Networks.TESTNET },
  )
    .addOperation(
      Operation.manageData({ name: "autolayer_auth", value: "one-time-nonce" }),
    )
    .setTimeout(300)
    .build();
  return transaction;
}
describe("wallet authentication challenge", () => {
  it("accepts the owner signature over the exact challenge", () => {
    const owner = Keypair.random();
    const tx = challenge(owner);
    const expected = tx.hash().toString("hex");
    tx.sign(owner);
    expect(
      verifySignedChallenge(tx.toXDR(), "TESTNET", expected, owner.publicKey()),
    ).toBe(true);
  });
  it("rejects another wallet's signature", () => {
    const owner = Keypair.random();
    const attacker = Keypair.random();
    const tx = challenge(owner);
    const expected = tx.hash().toString("hex");
    tx.sign(attacker);
    expect(() =>
      verifySignedChallenge(tx.toXDR(), "TESTNET", expected, owner.publicKey()),
    ).toThrow("signature is invalid");
  });
  it("rejects a modified challenge", () => {
    const owner = Keypair.random();
    const issued = challenge(owner);
    const modified = new TransactionBuilder(
      new Account(owner.publicKey(), "0"),
      { fee: "100", networkPassphrase: Networks.TESTNET },
    )
      .addOperation(
        Operation.manageData({
          name: "autolayer_auth",
          value: "different-nonce",
        }),
      )
      .setTimeout(300)
      .build();
    modified.sign(owner);
    expect(() =>
      verifySignedChallenge(
        modified.toXDR(),
        "TESTNET",
        issued.hash().toString("hex"),
        owner.publicKey(),
      ),
    ).toThrow("does not match");
  });
});
