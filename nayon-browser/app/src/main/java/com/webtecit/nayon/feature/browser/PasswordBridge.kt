package com.webtecit.nayon.feature.browser

import org.json.JSONObject

/**
 * Password save and fill, Chrome-style, without exposing any Java object to web pages.
 *
 * The page script (top frame only) reports through WebView's message channel:
 * - `form`   a sign-in form is on screen (also forms drawn later by the site's JavaScript),
 * - `focus`  the user tapped a username or password field,
 * - `user`   a username step was submitted (email first, password on the next page),
 * - `submit` a sign-in was submitted (username + password),
 * - `gone`   the password field disappeared after a submit (single-page sites).
 *
 * NAYON uses the sender origin WebView itself reports, never a value from the page, and only for
 * https pages in normal (non-private) tabs. Saved passwords are written into a page only when the
 * user taps "Sign in as …", and only while the tab is still on the same origin.
 */
object PasswordBridge {
    const val CHANNEL = "NayonPasswords"

    /** True when the page shows a password field (fallback for old WebView versions). */
    const val HAS_PASSWORD_FIELD_JS = "!!document.querySelector('input[type=password]')"

    /** One message from the page. */
    data class Event(
        val type: String,
        val username: String = "",
        val password: String = "",
        val field: String = "",
        val data: Map<String, String> = emptyMap(),
    )

    /** Classifies a form field (autocomplete attribute first, then name/id/placeholder). JS. */
    private const val TOK_JS = """function tok(el){var a=(el.getAttribute('autocomplete')||'').toLowerCase().split(/\s+/).pop();
var m={'cc-number':'ccnum','cc-name':'ccname','cc-exp':'ccexp','cc-exp-month':'ccm','cc-exp-year':'ccy','cc-csc':'csc','name':'name',
'given-name':'given','family-name':'family','organization':'org','street-address':'street','address-line1':'street','address-line2':'street2',
'address-level2':'city','address-level1':'state','postal-code':'postal','country':'country','country-name':'country','tel':'tel','email':'email'};
if(m[a])return m[a];var s=((el.name||'')+' '+(el.id||'')+' '+(el.placeholder||'')+' '+(el.getAttribute('aria-label')||'')).toLowerCase();
if(/card.?num|cc.?num|cardnumber|credit.?card|card.?no/.test(s))return 'ccnum';
if(/name.?on.?card|card.?holder|cc.?name|card.?name/.test(s))return 'ccname';
if(/cvv|cvc|csc|security.?code/.test(s))return 'csc';
if(/exp.*(month|mm)|cc.?month/.test(s))return 'ccm';
if(/exp.*(year|yy)|cc.?year/.test(s))return 'ccy';
if(/expir|exp.?date|mm.?.?yy/.test(s))return 'ccexp';
if(el.type==='email'||/e-?mail/.test(s))return 'email';
if(el.type==='tel'||/phone|mobile|tel/.test(s))return 'tel';
if(/zip|postal|post.?code|pin.?code/.test(s))return 'postal';
if(/city|town/.test(s))return 'city';
if(/state|province|region|county|district/.test(s))return 'state';
if(/country/.test(s))return 'country';
if(/address.?(line)?.?2|apartment|suite|apt/.test(s))return 'street2';
if(/address|street/.test(s))return 'street';
if(/company|organi[sz]ation/.test(s))return 'org';
if(/first.?name|given/.test(s))return 'given';
if(/last.?name|surname|family/.test(s))return 'family';
if(/full.?name|your.?name|^\s*name/.test(s))return 'name';
return '';}"""

    /** Runs at document start in every page. */
    val CAPTURE_SCRIPT = """(function(){try{if(window.top!==window)return;var ch=window.$CHANNEL;if(!ch)return;
var last=0,captured=false;function send(o){try{ch.postMessage(JSON.stringify(o));}catch(e){}}$TOK_JS
var ADDR={street:1,street2:1,city:1,state:1,postal:1,country:1};
function collect(root){var f={},ins=root.querySelectorAll('input,select');for(var i=0;i<ins.length;i++){var el=ins[i];
if(el.type==='password'||el.type==='hidden'||!el.value)continue;var t=tok(el);if(t&&t!=='csc'&&!f[t])f[t]=String(el.value).slice(0,200);}return f;}
function forms(root){try{var f=collect(root);if(f.ccnum&&f.ccnum.replace(/\D/g,'').length>=12){
send({t:'card',d:{ccnum:f.ccnum,ccname:f.ccname||'',ccexp:f.ccexp||'',ccm:f.ccm||'',ccy:f.ccy||''}});}
var n=0;for(var k in ADDR){if(f[k])n++;}if(n>=2&&!root.querySelector('input[type=password]')){var d={};
['name','given','family','org','street','street2','city','state','postal','country','tel','email'].forEach(function(k){if(f[k])d[k]=f[k];});send({t:'address',d:d});}}catch(e){}}
function vis(e){return !!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);}
function isUser(el){if(!el||el.tagName!=='INPUT')return false;var t=(el.type||'text').toLowerCase();
if(t!=='text'&&t!=='email'&&t!=='tel')return false;if(t==='email')return true;
var s=((el.name||'')+' '+(el.id||'')+' '+(el.autocomplete||'')+' '+(el.placeholder||'')+' '+(el.getAttribute('aria-label')||'')).toLowerCase();
return /user|email|e-mail|login|phone|mobile|account|identifier|username/.test(s);}
function userBefore(root,pw){var c=root.querySelectorAll('input[type=email],input[type=text],input[type=tel],input:not([type])'),u=null;
for(var i=0;i<c.length;i++){if(c[i].value&&(c[i].compareDocumentPosition(pw)&4))u=c[i];}return u;}
function grab(scope){try{forms(scope||document);var root=scope||document,pws=root.querySelectorAll('input[type=password]'),pw=null;
for(var i=0;i<pws.length;i++){if(pws[i].value){pw=pws[i];break;}}
if(!pw){var ins=root.querySelectorAll('input');for(var j=0;j<ins.length;j++){if(isUser(ins[j])&&ins[j].value&&vis(ins[j])){send({t:'user',u:ins[j].value});return;}}return;}
var u=userBefore(pw.form||document,pw),now=Date.now();if(now-last<400)return;last=now;captured=true;
send({t:'submit',u:u?u.value:'',p:pw.value});}catch(e){}}
document.addEventListener('submit',function(e){grab(e.target);},true);
document.addEventListener('click',function(e){var t=e.target&&e.target.closest&&e.target.closest('button,input[type=submit],input[type=button],[role=button],a');
if(t)setTimeout(function(){grab(t.form||null);},0);},true);
document.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target&&e.target.tagName==='INPUT')grab(e.target.form||null);},true);
document.addEventListener('focusin',function(e){var el=e.target;if(!el||(el.tagName!=='INPUT'&&el.tagName!=='SELECT'))return;
if(el.type==='password'){send({t:'focus',f:'p'});return;}var t=tok(el),root=el.form||document;
if(t.indexOf('cc')===0){send({t:'focus',f:'card'});return;}
var login=!!root.querySelector('input[type=password]');if(login){if(isUser(el))send({t:'focus',f:'u'});return;}
if(ADDR[t]||((t==='name'||t==='given'||t==='family'||t==='tel'||t==='email'||t==='org')&&(function(){var q=root.querySelectorAll('input,select');
for(var i=0;i<q.length;i++){if(ADDR[tok(q[i])])return true;}return false;})()))send({t:'focus',f:'address'});
else if(isUser(el))send({t:'focus',f:'u'});},true);
var shown=false,pending=false;function scan(){pending=false;var pw=document.querySelector('input[type=password]');
if(pw&&!shown){shown=true;send({t:'form'});}if(captured&&!pw){captured=false;send({t:'gone'});}if(!pw&&shown)shown=false;}
function later(){if(!pending){pending=true;setTimeout(scan,350);}}
if(document.readyState!=='loading')later();else document.addEventListener('DOMContentLoaded',later);
try{new MutationObserver(later).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
}catch(e){}})();"""

    /**
     * Fills a sign-in: the first visible password field and the username field before it; on a
     * username-only step (email first), just the username field.
     */
    fun fillScript(username: String, password: String): String =
        """(function(u,p){try{function vis(e){return !!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);}
function set(el,v){if(!el||v==null)return;el.focus();var d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');d.set.call(el,v);
el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
var pws=document.querySelectorAll('input[type=password]'),pw=null;for(var i=0;i<pws.length;i++){if(vis(pws[i])){pw=pws[i];break;}}
if(pw){var c=(pw.form||document).querySelectorAll('input[type=email],input[type=text],input[type=tel],input:not([type])'),user=null;
for(var j=0;j<c.length;j++){if(vis(c[j])&&(c[j].compareDocumentPosition(pw)&4))user=c[j];}
if(user&&u)set(user,u);set(pw,p);return true;}
var a=document.activeElement;var cand=(a&&a.tagName==='INPUT'&&a.type!=='password'&&a.type!=='hidden')?a:
document.querySelector('input[type=email],input[autocomplete=username],input[autocomplete=email],input[name*=user i],input[name*=email i],input[id*=email i],input[type=tel],input[type=text]');
if(cand&&u){set(cand,u);return true;}return false;}catch(e){return false;}})(${JSONObject.quote(username)},${JSONObject.quote(password)})"""

    /** Fills card / address fields of the form in focus (or the page) from [values] keyed by field token. */
    fun fillFormScript(values: Map<String, String>): String {
        val json = JSONObject().apply { values.forEach { (k, v) -> if (v.isNotBlank()) put(k, v) } }
        return """(function(v){try{$TOK_JS
function set(el,val){if(el.tagName==='SELECT'){var o=el.options,lv=String(val).toLowerCase(),sv=lv.slice(-2);
for(var i=0;i<o.length;i++){var t=(o[i].text||'').trim().toLowerCase(),w=(o[i].value||'').trim().toLowerCase();
if(w===lv||t===lv||w===sv||t===sv||(lv.length>3&&t.indexOf(lv)===0)){el.selectedIndex=i;break;}}}
else{var d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');d.set.call(el,val);}
el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
var a=document.activeElement,root=(a&&a.form)||document,n=0,ins=root.querySelectorAll('input,select');
for(var i=0;i<ins.length;i++){var el=ins[i];if(el.type==='hidden'||el.type==='password'||el.disabled||el.readOnly)continue;
var t=tok(el),val=v[t];if(t==='ccy'&&val&&el.maxLength===2)val=String(val).slice(-2);if(val){set(el,val);n++;}}
return n;}catch(e){return 0;}})($json)"""
    }

    fun parse(message: String?): Event? = runCatching {
        val o = JSONObject(message ?: return null)
        val type = o.optString("t")
        when (type) {
            "submit" -> {
                val p = o.optString("p")
                if (p.isEmpty() || p.length > 1_000) null else Event(type, o.optString("u").take(500), p)
            }
            "user" -> o.optString("u").take(500).takeIf { it.isNotBlank() }?.let { Event(type, username = it) }
            "focus", "form", "gone" -> Event(type, field = o.optString("f"))
            "card", "address" -> o.optJSONObject("d")?.let { d ->
                Event(type, data = d.keys().asSequence().take(20).associateWith { d.optString(it).take(200) })
            }
            else -> null
        }
    }.getOrNull()
}
