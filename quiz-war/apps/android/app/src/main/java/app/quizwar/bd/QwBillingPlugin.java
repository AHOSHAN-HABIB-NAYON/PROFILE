package app.quizwar.bd;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.List;

/**
 * Google Play Billing for the monthly Premium subscription. The app only starts the purchase and
 * hands the purchase token to the server; the server checks it with Google and acknowledges it.
 */
@CapacitorPlugin(name = "QwBilling")
public class QwBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient client;
    private PluginCall buying;

    private interface Ready { void run(); }
    private interface Got { void run(ProductDetails pd); }

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build();
    }

    private void ready(PluginCall call, Ready ok) {
        if (client.isReady()) { ok.run(); return; }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) ok.run();
                else call.reject("Google Play billing is not available: " + r.getDebugMessage(), "unavailable");
            }
            @Override
            public void onBillingServiceDisconnected() { /* reconnects on the next call */ }
        });
    }

    private void product(PluginCall call, String id, Got got) {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(Collections.singletonList(
                QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.SUBS).build()))
            .build();
        client.queryProductDetailsAsync(params, (r, list) -> {
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK || list == null || list.isEmpty()) {
                call.reject("Subscription not found: " + id, "not_found");
                return;
            }
            got.run(list.get(0));
        });
    }

    /** The cheapest-looking offer: base plan last (offers with a trial come first in Play's list). */
    private static ProductDetails.SubscriptionOfferDetails offer(ProductDetails pd) {
        List<ProductDetails.SubscriptionOfferDetails> offers = pd.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) return null;
        return offers.get(0);
    }

    /** Price text for the Premium page, e.g. "BDT 49.00" per "P1M". */
    @PluginMethod
    public void details(PluginCall call) {
        String id = call.getString("productId", "premium_monthly");
        ready(call, () -> product(call, id, (pd) -> {
            ProductDetails.SubscriptionOfferDetails o = offer(pd);
            JSObject ret = new JSObject();
            ret.put("productId", pd.getProductId());
            ret.put("title", pd.getName());
            if (o != null) {
                List<ProductDetails.PricingPhase> phases = o.getPricingPhases().getPricingPhaseList();
                ProductDetails.PricingPhase last = phases.get(phases.size() - 1);
                ret.put("price", last.getFormattedPrice());
                ret.put("period", last.getBillingPeriod());
                if (phases.size() > 1) {
                    ProductDetails.PricingPhase first = phases.get(0);
                    ret.put("introPrice", first.getPriceAmountMicros() == 0 ? "free" : first.getFormattedPrice());
                    ret.put("introPeriod", first.getBillingPeriod());
                }
            }
            call.resolve(ret);
        }));
    }

    /** Opens Google Play's purchase sheet. Resolves with the purchase token once paid. */
    @PluginMethod
    public void buy(PluginCall call) {
        String id = call.getString("productId", "premium_monthly");
        String account = call.getString("accountId", null);
        ready(call, () -> product(call, id, (pd) -> {
            ProductDetails.SubscriptionOfferDetails o = offer(pd);
            if (o == null) { call.reject("No plan for this subscription", "not_found"); return; }
            BillingFlowParams.Builder b = BillingFlowParams.newBuilder().setProductDetailsParamsList(Collections.singletonList(
                BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(pd).setOfferToken(o.getOfferToken()).build()));
            if (account != null) b.setObfuscatedAccountId(account);
            if (buying != null) buying.reject("Another purchase started", "busy");
            buying = call;
            getActivity().runOnUiThread(() -> {
                BillingResult r = client.launchBillingFlow(getActivity(), b.build());
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK && buying != null) {
                    if (r.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) buying.reject("You already have Premium", "already_owned");
                    else buying.reject("Could not open Google Play: " + r.getDebugMessage(), "failed");
                    buying = null;
                }
            });
        }));
    }

    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> purchases) {
        PluginCall call = buying;
        buying = null;
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            JSObject ret = new JSObject();
            ret.put("purchases", toJs(purchases));
            if (call != null) call.resolve(ret);
            else notifyListeners("purchase", ret);
        } else if (call != null) {
            if (code == BillingClient.BillingResponseCode.USER_CANCELED) call.reject("Cancelled", "cancelled");
            else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) call.reject("You already have Premium", "already_owned");
            else call.reject("Purchase failed: " + r.getDebugMessage(), "failed");
        }
    }

    /** Subscriptions this Google account owns (to restore premium on a new phone / after reinstall). */
    @PluginMethod
    public void owned(PluginCall call) {
        ready(call, () -> client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
            (r, list) -> {
                JSObject ret = new JSObject();
                ret.put("purchases", toJs(list == null ? Collections.emptyList() : list));
                call.resolve(ret);
            }));
    }

    private static JSArray toJs(List<Purchase> list) {
        JSArray arr = new JSArray();
        for (Purchase p : list) {
            JSObject o = new JSObject();
            o.put("token", p.getPurchaseToken());
            JSArray products = new JSArray();
            for (String id : p.getProducts()) products.put(id);
            o.put("products", products);
            o.put("purchased", p.getPurchaseState() == Purchase.PurchaseState.PURCHASED);
            o.put("acknowledged", p.isAcknowledged());
            arr.put(o);
        }
        return arr;
    }
}
