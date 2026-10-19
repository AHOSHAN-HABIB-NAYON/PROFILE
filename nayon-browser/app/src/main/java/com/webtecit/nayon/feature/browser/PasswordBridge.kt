package com.webtecit.nayon.feature.browser

import org.json.JSONObject

/**
 * Password save and fill, without exposing any Java object to web pages.
 *
 * - Save: a small script (top frame only) posts the sign-in a page submits to NAYON through
 *   WebView's message channel. NAYON uses the sender origin that WebView itself reports, never a
 *   value from the page, and only for https pages in normal (non-private) tabs.
 * - Fill: only when the user taps "Use saved password", and only if the tab is still on the same
 *   origin; the values are written into the page as escaped JSON strings.
 */
object PasswordBridge {
    const val CHANNEL = "NayonPasswords"

    /** Runs at document start in every page; listens for sign-in form submits. */
    val CAPTURE_SCRIPT = """(function(){try{if(window.top!==window)return;var ch=window.$CHANNEL;if(!ch)return;var last=0;
function users(root,pw){var c=root.querySelectorAll('input[type=email],input[type=text],input[type=tel],input:not([type])'),u=null;
for(var i=0;i<c.length;i++){if(c[i].value&&(c[i].compareDocumentPosition(pw)&4))u=c[i];}return u;}
function grab(scope){try{var root=scope||document,pws=root.querySelectorAll('input[type=password]'),pw=null;
for(var i=0;i<pws.length;i++){if(pws[i].value){pw=pws[i];break;}}if(!pw)return;
var u=users(pw.form||document,pw),now=Date.now();if(now-last<1500)return;last=now;
ch.postMessage(JSON.stringify({u:u?u.value:'',p:pw.value}));}catch(e){}}
document.addEventListener('submit',function(e){grab(e.target);},true);
document.addEventListener('click',function(e){var t=e.target&&e.target.closest&&e.target.closest('button,input[type=submit],[role=button]');
if(t)setTimeout(function(){grab(t.form||null);},0);},true);
document.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target&&e.target.type==='password')grab(e.target.form||null);},true);
}catch(e){}})();"""

    /** True when the page shows a password field (the fill offer only appears then). */
    const val HAS_PASSWORD_FIELD_JS = "!!document.querySelector('input[type=password]')"

    /** Fills the first password field (and the username field before it) with the given values. */
    fun fillScript(username: String, password: String): String =
        """(function(u,p){try{var pw=document.querySelector('input[type=password]');if(!pw)return false;
function set(el,v){var d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');d.set.call(el,v);
el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
var c=(pw.form||document).querySelectorAll('input[type=email],input[type=text],input[type=tel],input:not([type])'),user=null;
for(var i=0;i<c.length;i++){if(c[i].compareDocumentPosition(pw)&4)user=c[i];}
if(user&&u)set(user,u);set(pw,p);return true;}catch(e){return false;}})(${JSONObject.quote(username)},${JSONObject.quote(password)})"""

    /** Parses the script's message: {u, p}. */
    fun parse(message: String?): Pair<String, String>? = runCatching {
        val o = JSONObject(message ?: return null)
        val p = o.optString("p")
        if (p.isEmpty() || p.length > 1_000) null else o.optString("u").take(500) to p
    }.getOrNull()
}
