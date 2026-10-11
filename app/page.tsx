import type { ElementType } from "react";
import Link from "next/link";
import {
  Sparkles,
  Check,
  Wallet,
  Lock,
  Fingerprint,
  Zap,
  Layers,
  CreditCard,
  Globe,
  KeyRound,
  Eye,
  FileText,
  Smartphone,
  Shield,
  Gift,
  Send,
  ArrowDownToLine,
} from "lucide-react";
import { PublicNav } from "@/components/Nav";
import { VirtualCard } from "@/components/VirtualCard";
import { EthTicker } from "@/components/EthTicker";
import { Badge, Card, Button } from "@/components/ui";
import { LogoLockup } from "@/components/Logo";

function AssetChip({
  symbol,
  network,
  tone,
}: {
  symbol: string;
  network: string;
  tone: "green" | "violet";
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
            tone === "green"
              ? "bg-brand/10 text-brand-dark dark:text-brand"
              : "bg-violet-500/10 text-violet-500"
          }`}
        >
          {symbol.slice(0, 1)}
        </div>
        <div>
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{symbol}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">{network}</div>
        </div>
      </div>
      <Badge>Supported</Badge>
    </div>
  );
}

function StepRow({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <div className="text-xs font-mono font-medium mt-1 text-neutral-400 dark:text-neutral-500">{n}</div>
      <div className="flex-1 pb-8 border-l border-neutral-200 dark:border-neutral-800 pl-5 -ml-px">
        <h4 className="text-base font-semibold mb-1 text-neutral-900 dark:text-neutral-50">{title}</h4>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{body}</p>
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: ElementType;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 bg-neutral-100 dark:bg-neutral-800">
        <Icon className="w-4 h-4 text-brand-dark dark:text-brand" />
      </div>
      <h4 className="text-sm font-semibold mb-1.5 text-neutral-900 dark:text-neutral-50">{title}</h4>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{body}</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-16 pb-20 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <Badge tone="green">
            <Sparkles className="w-3 h-3" /> Robinhood ecosystem payment point
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight mt-5 leading-[1.08]">
            Your stablecoins.
            <br />
            Your card.
            <br />
            Your payment layer.
          </h1>
          <p className="text-base sm:text-lg mt-5 max-w-md text-neutral-500 dark:text-neutral-400">
            Fund a private virtual card with stablecoins and move from onchain funds to everyday
            online payments in one smooth flow.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-8">
            <Link href="/signup">
              <Button className="px-5 py-3">Get started</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="secondary" className="px-5 py-3">
                <Wallet className="w-4 h-4" /> Connect wallet to fund
              </Button>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <EthTicker />
            <Badge>USDG · Robinhood Chain</Badge>
            <Badge>USDC · Solana</Badge>
          </div>
        </div>
        <div className="flex justify-center md:justify-end">
          <VirtualCard size="large" holderName="ALEX RIVERA" />
        </div>
      </section>

      {/* Narrative */}
      <section className="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-20 text-center">
          <Badge tone="green">The BowPay thesis</Badge>
          <p className="text-2xl sm:text-3xl font-medium tracking-tight leading-snug mt-6">
            BowPay is a Robinhood ecosystem payment point. Fund it with stablecoins — especially
            USDG on Robinhood Chain — and get a private virtual card issued instantly, so you can
            pay for anything in one smooth move, powered by x402 for speed and privacy.
          </p>
        </div>
      </section>

      {/* Supported funding */}
      <section className="border-t border-neutral-200 dark:border-neutral-800">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16">
          <h2 className="text-2xl font-semibold tracking-tight mb-2">
            Built to fund from where your assets already are
          </h2>
          <p className="text-sm max-w-lg mb-8 text-neutral-500 dark:text-neutral-400">
            BowPay&apos;s architecture is designed to support stablecoin funding across multiple
            chains, starting with these networks.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
            <AssetChip symbol="USDG" network="Robinhood Chain" tone="green" />
            <AssetChip symbol="USDC" network="Solana" tone="violet" />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="max-w-6xl mx-auto px-5 sm:px-8 py-16">
        <div className="grid md:grid-cols-2 gap-12">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight mb-2">How it works</h2>
            <p className="text-sm max-w-sm text-neutral-500 dark:text-neutral-400">
              Four steps take you from a connected wallet to a card you can use online.
            </p>
          </div>
          <div>
            <StepRow n="01" title="Connect" body="Connect your wallet to link your onchain assets to BowPay." />
            <StepRow n="02" title="Fund" body="Fund your BowPay balance with a supported stablecoin." />
            <StepRow n="03" title="Issue" body="A private virtual card is generated for your account." />
            <StepRow n="04" title="Spend" body="Use the card for online payments, wherever cards are accepted." />
          </div>
        </div>
      </section>

      {/* BowGift */}
      <section id="gifts" className="border-t border-neutral-200 dark:border-neutral-800">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <Badge tone="green">
              <Gift className="w-3 h-3" /> BowGift
            </Badge>
            <h2 className="text-2xl font-semibold tracking-tight mt-4 mb-3">Send money as a gift card</h2>
            <p className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400 max-w-md">
              Pick an amount from $5, pay straight from your connected wallet, and download your card as an
              image to send. Whoever enters the code first gets the balance on their own BowPay card. A
              flat $1 fee applies.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-6">
              <Link href="/gifts">
                <Button className="px-5 py-3">
                  <Gift className="w-4 h-4" /> Create a gift card
                </Button>
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mt-8 max-w-md">
              <div className="flex items-start gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                <Send className="w-4 h-4 mt-0.5 shrink-0 text-brand-dark dark:text-brand" />
                <span>Send to any @username straight from your wallet</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                <ArrowDownToLine className="w-4 h-4 mt-0.5 shrink-0 text-brand-dark dark:text-brand" />
                <span>Claimed gifts land on the claimer&apos;s card instantly</span>
              </div>
            </div>
          </div>
          <div className="flex justify-center md:justify-end">
            <div
              className="relative w-full max-w-sm aspect-[1.6/1] rounded-3xl p-6 flex flex-col justify-between overflow-hidden shadow-xl rotate-[-3deg]"
              style={{ background: "linear-gradient(135deg, #A6EF33 0%, #5E9E00 100%)" }}
            >
              <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-white/10" />
              <div className="relative flex items-center justify-between text-neutral-950">
                <span className="font-bold text-lg">BowGift</span>
                <span className="text-xs font-semibold opacity-70">BowPay</span>
              </div>
              <div className="relative text-neutral-950">
                <div className="text-[11px] font-semibold tracking-[0.2em] opacity-70">GIFT CARD</div>
                <div className="text-6xl font-extrabold leading-none mt-1">$25</div>
              </div>
              <div className="relative rounded-2xl bg-neutral-950/90 px-4 py-3">
                <div className="text-[9px] font-semibold tracking-[0.25em] text-brand/70">REDEEM CODE</div>
                <div className="font-mono text-sm font-bold tracking-widest text-brand">BOW-XXXX-XXXX-XXXX-XXXX</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why BowPay */}
      <section className="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16">
          <h2 className="text-2xl font-semibold tracking-tight mb-8">Why BowPay</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            <FeatureCard icon={Wallet} title="Stablecoin funded" body="Your balance is backed by stablecoins you fund directly from your wallet." />
            <FeatureCard icon={Lock} title="Private virtual cards" body="Card details are generated for you and kept masked until you choose to reveal them." />
            <FeatureCard icon={Fingerprint} title="Wallet-first" body="Your wallet is the source of truth for funding — no intermediary custody step." />
            <FeatureCard icon={Zap} title="Fast settlement architecture" body="Built around infrastructure designed for near-instant settlement." />
            <FeatureCard icon={Layers} title="Multi-chain ready" body="Designed to extend to additional chains and stablecoins over time." />
            <FeatureCard icon={CreditCard} title="Payment-focused" body="One purpose: turn onchain balances into everyday card payments." />
          </div>
        </div>
      </section>

      {/* x402 */}
      <section id="x402" className="max-w-6xl mx-auto px-5 sm:px-8 py-16">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <Badge tone="violet">Payment infrastructure</Badge>
            <h2 className="text-2xl font-semibold tracking-tight mt-4 mb-3">
              Built for internet-native payments
            </h2>
            <p className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
              BowPay is designed around modern payment infrastructure that can connect
              blockchain-native funds with digital commerce. x402 provides an open standard for
              internet-native payments and can become part of BowPay&apos;s future payment
              infrastructure.
            </p>
          </div>
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-neutral-100 dark:bg-neutral-800">
                <Globe className="w-4 h-4 text-brand-dark dark:text-brand" />
              </div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                x402 · open payment standard
              </div>
            </div>
            <div className="text-sm text-neutral-500 dark:text-neutral-400 space-y-2">
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-brand-dark dark:text-brand mt-0.5 shrink-0" />
                <span>A future building block for connecting onchain funds to commerce</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-brand-dark dark:text-brand mt-0.5 shrink-0" />
                <span>Not a card network — it does not issue cards on its own</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-brand-dark dark:text-brand mt-0.5 shrink-0" />
                <span>One part of a broader architecture concept, not a live feature</span>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16">
          <h2 className="text-2xl font-semibold tracking-tight mb-8">Security by design</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            <FeatureCard icon={Wallet} title="Wallet-controlled funding" body="You initiate and approve every funding transaction from your own wallet." />
            <FeatureCard icon={KeyRound} title="Secure authentication" body="Account access is protected by modern authentication, built on Supabase Auth." />
            <FeatureCard icon={Eye} title="Private card information" body="Card numbers and CVV stay masked by default until you choose to reveal them." />
            <FeatureCard icon={FileText} title="Transaction visibility" body="Every funding and spending event is logged to your transaction history." />
            <FeatureCard icon={Smartphone} title="Session security" body="Review and manage active sessions and login activity from settings." />
            <FeatureCard icon={Shield} title="Account protection" body="Account protection controls are designed in from the start of the product." />
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2">
            <LogoLockup />
            <p className="text-sm mt-4 max-w-xs text-neutral-500 dark:text-neutral-400">
              A stablecoin-funded virtual card, built as a Robinhood ecosystem payment point.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-3 text-neutral-400 dark:text-neutral-500">
              Product
            </div>
            <ul className="space-y-2">
              {["How it works", "Security", "Supported assets", "FAQ"].map((i) => (
                <li key={i}>
                  <a href="#" className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">
                    {i}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-3 text-neutral-400 dark:text-neutral-500">
              Legal
            </div>
            <ul className="space-y-2">
              {["Privacy", "Terms"].map((i) => (
                <li key={i}>
                  <a href="#" className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">
                    {i}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-6 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-400 dark:text-neutral-500">
          © 2026 BowPay. A product concept in active development.
        </div>
      </footer>
    </div>
  );
}
