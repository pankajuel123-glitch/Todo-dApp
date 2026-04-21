Setup Guide — Solana Todo dApp
What You Need to Download First
1. Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.zshrc
2. Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
3. Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install latest
avm use latest
4. Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.zshrc
nvm install --lts
5. Yarn
npm install -g yarn
6. Phantom Wallet (Browser Extension)
Go to https://phantom.app and install the extension for Chrome, Brave, or Firefox.
Verify Everything is Installed
rustc --version
solana --version
anchor --version
node --version
yarn --version
How to Run the Project
Step 1 — Install project dependencies
yarn install
Step 2 — Build the Solana program
anchor build
Step 3 — Open Terminal 1 and start the local blockchain (keep this running)
solana-test-validator
Step 4 — Open Terminal 2 and deploy the program
solana config set --url http://127.0.0.1:8899
anchor deploy
Step 5 — Airdrop SOL to your Phantom wallet (so you can pay for transactions)
Copy your wallet address from Phantom and run:

solana airdrop 5 <7mx76fduc79x3R4SxYXnfUKjVEqMS3iqqtJVX9eXF8V7> --url http://127.0.0.1:8899
Example:

solana airdrop 5 7mx76fduc79x3R4SxYXnfUKjVEqMS3iqqtJVX9eXF8V7 --url http://127.0.0.1:8899
Step 6 — Serve the frontend
npx serve app
Step 7 — Open the app in your browser
http://localhost:3000
Important Notes
The solana-test-validator terminal must stay open the whole time.
Every time you restart your computer, you need to start solana-test-validator again and re-airdrop SOL.
Do NOT open 127.0.0.1:8899 in the browser — that is the blockchain RPC, not the app.
Always open the app at http://localhost:3000.
Connect Phantom wallet on the app, then click "Create Task List" to initialize your account.
