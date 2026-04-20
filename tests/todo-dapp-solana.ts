import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TodoDappSolana } from "../target/types/todo_dapp_solana";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

describe("todo-dapp-solana", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.todoDappSolana as Program<TodoDappSolana>;

  const deriveUserTasks = (owner: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("user-tasks"), owner.toBuffer()],
      program.programId
    )[0];

  async function fundedKeypair(): Promise<Keypair> {
    const kp = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      kp.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
    return kp;
  }

  async function initUser(user: Keypair) {
    const userTasks = deriveUserTasks(user.publicKey);
    await program.methods
      .initializeUser()
      .accounts({
        userTasks,
        user: user.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();
    return userTasks;
  }

  describe("initializeUser", () => {
    it("creates an empty task list for the user", async () => {
      const user = await fundedKeypair();
      const userTasks = await initUser(user);
      const state = await program.account.userTasks.fetch(userTasks);
      assert.strictEqual(state.tasks.length, 0);
      assert.strictEqual(state.nextId.toNumber(), 1);
      assert.ok(state.owner.equals(user.publicKey));
    });
  });

  describe("createTask", () => {
    it("creates a task successfully", async () => {
      const user = await fundedKeypair();
      const userTasks = await initUser(user);

      await program.methods
        .createTask("Buy groceries", 2, new anchor.BN(0))
        .accounts({ userTasks, user: user.publicKey })
        .signers([user])
        .rpc();

      const state = await program.account.userTasks.fetch(userTasks);
      assert.strictEqual(state.tasks.length, 1);
      assert.strictEqual(state.tasks[0].content, "Buy groceries");
      assert.strictEqual(state.tasks[0].priority, 2);
      assert.strictEqual(state.tasks[0].completed, false);
      assert.strictEqual(state.tasks[0].id.toNumber(), 1);
    });

    it("rejects empty content", async () => {
      const user = await fundedKeypair();
      const userTasks = await initUser(user);
      try {
        await program.methods
          .createTask("", 1, new anchor.BN(0))
          .accounts({ userTasks, user: user.publicKey })
          .signers([user])
          .rpc();
        assert.fail("should have reverted");
      } catch (e) {
        assert.match(e.toString(), /EmptyContent/);
      }
    });

    it("rejects invalid priority", async () => {
      const user = await fundedKeypair();
      const userTasks = await initUser(user);
      try {
        await program.methods
          .createTask("Do thing", 4, new anchor.BN(0))
          .accounts({ userTasks, user: user.publicKey })
          .signers([user])
          .rpc();
        assert.fail("should have reverted");
      } catch (e) {
        assert.match(e.toString(), /InvalidPriority/);
      }
    });

    it("assigns incrementing IDs", async () => {
      const user = await fundedKeypair();
      const userTasks = await initUser(user);
      for (const c of ["a", "b", "c"]) {
        await program.methods
          .createTask(c, 1, new anchor.BN(0))
          .accounts({ userTasks, user: user.publicKey })
          .signers([user])
          .rpc();
      }
      const state = await program.account.userTasks.fetch(userTasks);
      assert.deepStrictEqual(
        state.tasks.map((t) => t.id.toNumber()),
        [1, 2, 3]
      );
    });
  });

  describe("toggleComplete", () => {
    it("toggles a task's completed state", async () => {
      const user = await fundedKeypair();
      const userTasks = await initUser(user);
      await program.methods
        .createTask("Test", 1, new anchor.BN(0))
        .accounts({ userTasks, user: user.publicKey })
        .signers([user])
        .rpc();

      await program.methods
        .toggleComplete(new anchor.BN(1))
        .accounts({ userTasks, user: user.publicKey })
        .signers([user])
        .rpc();

      let state = await program.account.userTasks.fetch(userTasks);
      assert.strictEqual(state.tasks[0].completed, true);

      await program.methods
        .toggleComplete(new anchor.BN(1))
        .accounts({ userTasks, user: user.publicKey })
        .signers([user])
        .rpc();

      state = await program.account.userTasks.fetch(userTasks);
      assert.strictEqual(state.tasks[0].completed, false);
    });

    it("reverts for non-existent task", async () => {
      const user = await fundedKeypair();
      const userTasks = await initUser(user);
      try {
        await program.methods
          .toggleComplete(new anchor.BN(999))
          .accounts({ userTasks, user: user.publicKey })
          .signers([user])
          .rpc();
        assert.fail("should have reverted");
      } catch (e) {
        assert.match(e.toString(), /TaskNotFound/);
      }
    });
  });

  describe("deleteTask", () => {
    it("deletes a task and shrinks the list", async () => {
      const user = await fundedKeypair();
      const userTasks = await initUser(user);
      await program.methods
        .createTask("keep", 1, new anchor.BN(0))
        .accounts({ userTasks, user: user.publicKey })
        .signers([user])
        .rpc();
      await program.methods
        .createTask("delete", 1, new anchor.BN(0))
        .accounts({ userTasks, user: user.publicKey })
        .signers([user])
        .rpc();

      await program.methods
        .deleteTask(new anchor.BN(2))
        .accounts({ userTasks, user: user.publicKey })
        .signers([user])
        .rpc();

      const state = await program.account.userTasks.fetch(userTasks);
      assert.strictEqual(state.tasks.length, 1);
      assert.strictEqual(state.tasks[0].content, "keep");
    });
  });

  describe("per-wallet isolation", () => {
    it("keeps tasks separate across users", async () => {
      const alice = await fundedKeypair();
      const bob = await fundedKeypair();
      const aliceTasks = await initUser(alice);
      const bobTasks = await initUser(bob);

      await program.methods
        .createTask("alice task", 1, new anchor.BN(0))
        .accounts({ userTasks: aliceTasks, user: alice.publicKey })
        .signers([alice])
        .rpc();

      const aliceState = await program.account.userTasks.fetch(aliceTasks);
      const bobState = await program.account.userTasks.fetch(bobTasks);
      assert.strictEqual(aliceState.tasks.length, 1);
      assert.strictEqual(bobState.tasks.length, 0);
    });

    it("blocks users from mutating someone else's tasks", async () => {
      const alice = await fundedKeypair();
      const bob = await fundedKeypair();
      const aliceTasks = await initUser(alice);
      await initUser(bob);

      await program.methods
        .createTask("alice task", 1, new anchor.BN(0))
        .accounts({ userTasks: aliceTasks, user: alice.publicKey })
        .signers([alice])
        .rpc();

      try {
        await program.methods
          .deleteTask(new anchor.BN(1))
          .accounts({ userTasks: aliceTasks, user: bob.publicKey })
          .signers([bob])
          .rpc();
        assert.fail("bob should not be able to mutate alice's tasks");
      } catch (e) {
        assert.match(e.toString(), /(ConstraintSeeds|AnchorError)/);
      }
    });
  });
});
