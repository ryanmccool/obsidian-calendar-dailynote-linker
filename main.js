"use strict";var Y=Object.defineProperty;var ye=Object.getOwnPropertyDescriptor;var we=Object.getOwnPropertyNames;var he=Object.prototype.hasOwnProperty;var Ne=(e,t)=>{for(var n in t)Y(e,n,{get:t[n],enumerable:!0})},Pe=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let a of we(t))!he.call(e,a)&&a!==n&&Y(e,a,{get:()=>t[a],enumerable:!(r=ye(t,a))||r.enumerable});return e};var be=e=>Pe(Y({},"__esModule",{value:!0}),e);var Ke={};Ne(Ke,{default:()=>x});module.exports=be(Ke);var c=require("obsidian");var g=require("obsidian");function p(e){return typeof e=="string"?e:""}function C(e){return!!window.app.plugins.getPlugin("periodic-notes")?.settings?.[e]?.enabled}function F(){try{let{internalPlugins:e,plugins:t}=window.app;if(C("daily")){let{format:o,folder:i,template:s}=t.getPlugin("periodic-notes")?.settings?.daily||{};return{format:o||"YYYY-MM-DD",folder:p(i).trim(),template:p(s).trim()}}let{folder:n,format:r,template:a}=e.getPluginById("daily-notes")?.instance?.options||{};return{format:r||"YYYY-MM-DD",folder:p(n).trim(),template:p(a).trim()}}catch(e){console.info("No custom daily note settings found!",e)}}function De(){try{let e=window.app.plugins,t=e.getPlugin("calendar")?.options,n=e.getPlugin("periodic-notes")?.settings?.weekly;if(C("weekly")&&n)return{format:n.format||"gggg-[W]ww",folder:p(n.folder).trim(),template:p(n.template).trim()};let r=t||{};return{format:r.weeklyNoteFormat||"gggg-[W]ww",folder:p(r.weeklyNoteFolder).trim(),template:p(r.weeklyNoteTemplate).trim()}}catch(e){console.info("No custom weekly note settings found!",e)}}function ke(){let e=window.app.plugins;try{let t=C("monthly")&&e.getPlugin("periodic-notes")?.settings?.monthly||{};return{format:t.format||"YYYY-MM",folder:p(t.folder).trim(),template:p(t.template).trim()}}catch(t){console.info("No custom monthly note settings found!",t)}}function Ce(){let e=window.app.plugins;try{let t=C("quarterly")&&e.getPlugin("periodic-notes")?.settings?.quarterly||{};return{format:t.format||"YYYY-[Q]Q",folder:p(t.folder).trim(),template:p(t.template).trim()}}catch(t){console.info("No custom quarterly note settings found!",t)}}function Fe(){let e=window.app.plugins;try{let t=C("yearly")&&e.getPlugin("periodic-notes")?.settings?.yearly||{};return{format:t.format||"YYYY",folder:p(t.folder).trim(),template:p(t.template).trim()}}catch(t){console.info("No custom yearly note settings found!",t)}}function q(...e){let t=[];for(let r=0,a=e.length;r<a;r++)t=t.concat(e[r].split("/"));let n=[];for(let r=0,a=t.length;r<a;r++){let o=t[r];!o||o==="."||n.push(o)}return t[0]===""&&n.unshift(""),n.join("/")}async function Ee(e){let t=e.replace(/\\/g,"/").split("/");if(t.pop(),t.length){let n=q(...t);window.app.vault.getAbstractFileByPath(n)||await window.app.vault.createFolder(n)}}async function Ae(e,t){t.endsWith(".md")||(t+=".md");let n=(0,g.normalizePath)(q(e,t));return await Ee(n),n}async function Se(e){let{metadataCache:t,vault:n}=window.app,r=(0,g.normalizePath)(e);if(r==="/")return["",null];try{let a=t.getFirstLinkpathDest(r,"");return[await n.cachedRead(a),window.app.foldManager.load(a)]}catch(a){return console.error(`Failed to read the daily note template '${r}'`,a),new g.Notice("Failed to read the daily note template"),["",null]}}function j(e,t="day"){return`${t}-${e.clone().startOf(t).format()}`}function Q(e){return e.replace(/\[[^\]]*\]/g,"")}function Te(e,t){if(t==="week"){let n=Q(e);return/w{1,2}/i.test(n)&&(/M{1,4}/.test(n)||/D{1,4}/.test(n))}return!1}function Me(e,t){return ve(e.basename,t)}function ve(e,t){let n={day:F,week:De,month:ke,quarter:Ce,year:Fe}[t]().format.split("/").pop(),r=window.moment(e,n,!0);if(!r.isValid())return null;if(Te(n,t)&&t==="week"){let a=Q(n);if(/w{1,2}/i.test(a))return window.moment(e,n.replace(/M{1,4}/g,"").replace(/D{1,4}/g,""),!1)}return r}var xe=class extends Error{};async function Z(e){let{app:t}=window,{vault:n}=t,r=window.moment,{template:a="",format:o="",folder:i=""}=F()??{},[s,d]=await Se(a),u=e.format(o),k=await Ae(i,u);try{let y=await n.create(k,s.replace(/{{\s*date\s*}}/gi,u).replace(/{{\s*time\s*}}/gi,r().format("HH:mm")).replace(/{{\s*title\s*}}/gi,u).replace(/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi,(pe,Je,ge,fe,me,V)=>{let _=r(),$=e.clone().set({hour:_.get("hour"),minute:_.get("minute"),second:_.get("second")});return ge&&$.add(parseInt(fe,10),me),V?$.format(V.substring(1).trim()):$.format(o)}).replace(/{{\s*yesterday\s*}}/gi,e.clone().subtract(1,"day").format(o)).replace(/{{\s*tomorrow\s*}}/gi,e.clone().add(1,"d").format(o)));return t.foldManager.save(y,d),y}catch(y){console.error(`Failed to create file: '${k}'`,y),new g.Notice("Unable to create new file.")}}function L(e,t){return t[j(e,"day")]??null}function I(){let{vault:e}=window.app,{folder:t=""}=F(),n=e.getAbstractFileByPath((0,g.normalizePath)(t));if(!(n instanceof g.TFolder))throw new xe("Failed to find daily notes folder");let r={};return g.Vault.recurseChildren(n,a=>{if(a instanceof g.TFile){let o=Me(a,"day");if(o){let i=j(o,"day");r[i]=a}}}),r}var G=require("node:child_process"),X=require("node:util");var l=class extends Error{constructor(t){super(t),this.name="CalendarPayloadValidationError"}};function T(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function E(e,t){if(typeof e!="string")throw new l(`${t} must be a string`);return e}function w(e,t){if(e!==null&&typeof e!="string")throw new l(`${t} must be a string or null`);return e}function M(e,t){let n=E(e,t);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(n)||Number.isNaN(Date.parse(n)))throw new l(`${t} must be a valid ISO date`);return n}function _e(e){let t=E(e,"targetDate");if(!/^\d{4}-\d{2}-\d{2}$/.test(t))throw new l("targetDate must be YYYY-MM-DD");let[n,r,a]=t.split("-").map(Number),o=new Date(Date.UTC(n,r-1,a));if(o.getUTCFullYear()!==n||o.getUTCMonth()!==r-1||o.getUTCDate()!==a)throw new l("targetDate must be a valid calendar date");return t}function $e(e){return/^(?:Calendar attendee|Some Calendar attendee).*unavailable on this macOS\/source\.$/.test(e)}function Ye(e,t){if(!T(e))throw new l(`events attendee ${t} must be an object`);return{displayName:w(e.displayName,`attendee ${t} displayName`),email:w(e.email,`attendee ${t} email`),status:w(e.status,`attendee ${t} status`)}}function Le(e,t){if(!T(e))throw new l(`event ${t} must be an object`);let n=e.attendees;if(!Array.isArray(n))throw new l(`event ${t} attendees must be an array`);let r=M(e.start,`event ${t} start`),a=M(e.end,`event ${t} end`);if(Date.parse(a)<Date.parse(r))throw new l(`event ${t} end cannot precede start`);if(typeof e.allDay!="boolean")throw new l(`event ${t} allDay must be a boolean`);return{id:w(e.id,`event ${t} id`),calendar:w(e.calendar,`event ${t} calendar`),title:E(e.title,`event ${t} title`),start:r,end:a,allDay:e.allDay,url:w(e.url,`event ${t} url`),location:w(e.location,`event ${t} location`),notes:e.notes===null?null:(()=>{throw new l(`event ${t} notes must be null`)})(),attendees:n.map((o,i)=>Ye(o,i))}}function K(e){let t;try{t=JSON.parse(e)}catch{throw new l("Calendar bridge output was not valid JSON")}return Ie(t)}function Ie(e){if(!T(e))throw new l("Calendar bridge output must be a JSON object");if(e.schemaVersion!==1)throw new l("Calendar bridge output has an unsupported schema version");if(!T(e.range))throw new l("Calendar bridge output range must be an object");let t=M(e.range.start,"range start"),n=M(e.range.end,"range end");if(Date.parse(n)<=Date.parse(t))throw new l("range end must be after range start");let r=E(e.range.timeZone,"range timeZone").trim();if(!r)throw new l("range timeZone cannot be empty");if(!Array.isArray(e.events))throw new l("Calendar bridge output events must be an array");if(!Array.isArray(e.warnings)||e.warnings.some(o=>typeof o!="string"))throw new l("Calendar bridge output warnings must be an array of strings");let a=e.warnings;return{schemaVersion:1,source:E(e.source,"source"),targetDate:_e(e.targetDate),range:{start:t,end:n,timeZone:r},events:e.events.map((o,i)=>Le(o,i)),warnings:a.map(o=>{if(!$e(o))throw new l("Calendar bridge warnings may only describe unavailable attendee properties");return o})}}var J=`/*
 * Fixed JXA bridge for Calendar.app.
 * The last expression returned by main() is the only stdout produced by this script.
 */

function readEventProperty(object, propertyName) {
  if (!object) throw new Error("Calendar property " + propertyName + " had no object.");
  try {
    var value = object[propertyName];
    return typeof value === "function" ? value.call(object) : value;
  } catch (error) {
    throw new Error("Calendar property " + propertyName + " could not be read.");
  }
}

function readOptionalAttendeeProperty(object, propertyName) {
  try {
    if (!object) return { available: false, value: null };
    var value = object[propertyName];
    value = typeof value === "function" ? value.call(object) : value;
    return { available: value !== undefined, value: value === undefined ? null : value };
  } catch (error) {
    return { available: false, value: null };
  }
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  var text = String(value);
  return text.length ? text : null;
}

function dateOrNull(value) {
  if (!value) return null;
  var date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function warningOnce(warnings, message) {
  if (warnings.indexOf(message) === -1) warnings.push(message);
}

function attendeeValue(attendee, propertyName, warningLabel, warnings) {
  var result = readOptionalAttendeeProperty(attendee, propertyName);
  if (!result.available) {
    warningOnce(warnings, "Calendar attendee " + warningLabel + " data is unavailable on this macOS/source.");
    return null;
  }
  return stringOrNull(result.value);
}

function readAttendees(event, warnings) {
  var rawAttendees;
  try {
    var attendeeResult = readOptionalAttendeeProperty(event, "attendees");
    if (!attendeeResult.available) rawAttendees = undefined;
    else rawAttendees = attendeeResult.value;
  } catch (error) {
    rawAttendees = undefined;
  }
  if (rawAttendees === undefined) {
    warningOnce(warnings, "Calendar attendee data is unavailable on this macOS/source.");
    return [];
  }
  if (rawAttendees === null) return [];
  if (!Array.isArray(rawAttendees)) {
    warningOnce(warnings, "Calendar attendee data is unavailable on this macOS/source.");
    return [];
  }

  var attendees = [];
  try {
    for (var index = 0; index < rawAttendees.length; index += 1) {
      var attendee = rawAttendees[index];
      attendees.push({
        displayName: attendeeValue(attendee, "displayName", "display name", warnings),
        email: attendeeValue(attendee, "email", "email", warnings),
        status: attendeeValue(attendee, "participationStatus", "participation status", warnings)
      });
    }
  } catch (error) {
    warningOnce(warnings, "Some Calendar attendee data is unavailable on this macOS/source.");
  }
  return attendees;
}

function calendarName(event) {
  var calendar = readEventProperty(event, "calendar");
  return calendar === null ? null : stringOrNull(readEventProperty(calendar, "title"));
}

function main() {
  var Calendar = Application("Calendar");
  var warnings = [];
  var now = new Date();
  function pad(number) {
    return number < 10 ? "0" + number : String(number);
  }
  var targetDate = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  var rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  var rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  var timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  var events = [];

  var calendars = Calendar.calendars();
  if (!Array.isArray(calendars)) throw new Error("Calendar calendars could not be enumerated.");
  for (var calendarIndex = 0; calendarIndex < calendars.length; calendarIndex += 1) {
    var calendar = calendars[calendarIndex];
    var calendarEvents;
    try {
      calendarEvents = calendar.events.whose({
        startDate: { _lessThan: rangeEnd },
        endDate: { _greaterThan: rangeStart }
      })();
    } catch (error) {
      throw new Error("Calendar events could not be enumerated.");
    }
    if (!Array.isArray(calendarEvents)) throw new Error("Calendar events could not be enumerated.");

    for (var eventIndex = 0; eventIndex < calendarEvents.length; eventIndex += 1) {
      var event = calendarEvents[eventIndex];
      var start = dateOrNull(readEventProperty(event, "startDate"));
      var end = dateOrNull(readEventProperty(event, "endDate"));
      if (!start || !end) {
        throw new Error("A Calendar event did not provide valid dates.");
      }
      if (start >= rangeEnd || end <= rangeStart) continue;

      var allDay = readEventProperty(event, "alldayEvent");
      if (typeof allDay !== "boolean") throw new Error("Calendar event all-day value was not boolean.");
      events.push({
        id: stringOrNull(readEventProperty(event, "uid")),
        calendar: calendarName(event),
        title: stringOrNull(readEventProperty(event, "summary")) || "(Untitled event)",
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: Boolean(allDay),
        url: stringOrNull(readEventProperty(event, "url")),
        location: stringOrNull(readEventProperty(event, "location")),
        notes: null,
        attendees: readAttendees(event, warnings)
      });
    }
  }

  return JSON.stringify({
    schemaVersion: 1,
    source: "Calendar.app",
    targetDate: targetDate,
    range: {
      start: rangeStart.toISOString(),
      end: rangeEnd.toISOString(),
      timeZone: timeZone
    },
    events: events,
    warnings: warnings
  });
}

main();
`;var Re=(0,X.promisify)(G.execFile),He=async(e,t,n)=>await Re(e,t,n),h=class extends Error{constructor(t){super(t),this.name="CalendarBridgeError"}};async function ee(e=He){let t;try{t=await e("/usr/bin/osascript",["-l","JavaScript","-e",J],{encoding:"utf8",timeout:3e4,maxBuffer:2*1024*1024,shell:!1,windowsHide:!0})}catch(r){let a=r instanceof Error?r.message:String(r);throw new h("Calendar access failed. Allow Obsidian to control Calendar in System Settings > Privacy & Security > Automation, then try again. "+a)}let n=t.stdout.trim();if(!n){let r=t.stderr.trim();throw new h(`Calendar bridge returned no data. Check Calendar and Automation permissions${r?`: ${r}`:"."}`)}try{return K(n)}catch(r){let a=r instanceof Error?r.message:String(r);throw new h(`Calendar bridge returned malformed data: ${a}`)}}function R(e,t,n){if(!t)return;let r=e.get(t)??[];r.some(a=>a.path===n.path)||(r.push(n),r.sort((a,o)=>a.path.localeCompare(o.path))),e.set(t,r)}function O(e){return e.normalize("NFKC").trim().replace(/\s+/gu," ").toLowerCase()}function te(e){return e.normalize("NFKC").trim().replace(/\s+/gu,"").toLowerCase()}function H(e,t){let n=e?.[t];return typeof n=="string"?[n]:Array.isArray(n)?n.filter(r=>typeof r=="string"):[]}function Oe(e){let t=e.path.replaceAll("\\","/"),n=e.basename||t.split("/").at(-1)?.replace(/\.md$/i,"")||"";return{path:t,basename:n,file:e.file}}function ne(e,t){let n=new Map,r=new Map,o=`${t.replaceAll("\\","/").replace(/\/+$/u,"")}/`;for(let i of e){let s=i.path.replaceAll("\\","/");if(!s.startsWith(o)||!s.toLowerCase().endsWith(".md"))continue;let d=Oe(i);R(r,O(d.basename),d);for(let u of H(i.frontmatter,"aliases"))R(r,O(u),d);for(let u of[...H(i.frontmatter,"email"),...H(i.frontmatter,"emails")])R(n,te(u),d)}return{byEmail:n,byName:r}}function ze(e,t){let n=t.email?te(t.email):"";if(n){let o=e.byEmail.get(n);if(o?.length===1)return o[0];if(o&&o.length>1)return null}let r=t.displayName?O(t.displayName):"";if(!r)return null;let a=e.byName.get(r);return a?.length===1?a[0]:null}function re(e,t){let n=[];for(let r of t){let a=ze(e,r);a&&!n.some(o=>o.path===a.path)&&n.push(a)}return n}function ae(e,t){let n=new Map,r=a=>a.map(o=>{let i=n.get(o.path);return i===void 0&&(i=t(o),n.set(o.path,i)),{...o,markdownLink:i}});return{byEmail:new Map([...e.byEmail].map(([a,o])=>[a,r(o)])),byName:new Map([...e.byName].map(([a,o])=>[a,r(o)]))}}var P="<!-- calendar-daily-note-linker:start -->",b="<!-- calendar-daily-note-linker:end -->",D=class extends Error{constructor(t){super(t),this.name="CalendarBlockError"}};function ie(e){return[P,...e.map(le),b].join(`
`)}function se(e,t){Ue(t);let n=[],r=[],a=e.split(`
`);if(a.forEach((s,d)=>{let u=s.endsWith("\r")?s.slice(0,-1):s,k=u===P,y=u===b;if(k&&n.push(d),y&&r.push(d),(u.includes(P)||u.includes(b))&&!k&&!y)throw new D("The Calendar section marker must be on an exact standalone line.")}),n.length===0&&r.length===0)return We(e,t);if(n.length!==1||r.length!==1||n[0]>=r[0])throw new D("The Calendar section markers are duplicated, incomplete, or out of order.");let o=oe(a,n[0]),i=oe(a,r[0]+1);return`${e.slice(0,o)}${t}${e.slice(i)}`}function Ue(e){let t=e.split(`
`).map(n=>n.endsWith("\r")?n.slice(0,-1):n);if(t[0]!==P||t[t.length-1]!==b)throw new D("Generated Calendar content has invalid section markers.");if(t.slice(1,-1).some(n=>n.includes(P)||n.includes(b)))throw new D("Generated Calendar content contains a section marker literal.")}function le(e){return e.replace(/\r\n?|\n|\u2028|\u2029/gu," ").replace(/[\u0000-\u001f\u007f-\u009f]/gu,"").replaceAll(P,"[calendar section start]").replaceAll(b,"[calendar section end]")}function z(e){return le(e).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replace(/[\\`*_{}\[\]()#+\-.!|>~]/gu,"\\$&")}function We(e,t){let n=e.length>0&&!e.endsWith(`
`)?`
`:"";return`${e}${n}${t}
`}function oe(e,t){let n=0;for(let r=0;r<t&&r<e.length;r+=1)n+=e[r].length+1;return n}function Be(e){return e.replaceAll("\\","\\\\").replace(/[\s<>]/gu,t=>encodeURIComponent(t)).replaceAll("(","\\(").replaceAll(")","\\)").replaceAll('"',"%22")}function Ve(e){if(!e?.trim()||/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(e)||e.includes("<!-- calendar-daily-note-linker:start -->")||e.includes("<!-- calendar-daily-note-linker:end -->"))return null;try{let t=new URL(e.trim());return t.protocol==="http:"||t.protocol==="https:"?t.href:null}catch{return null}}function qe(e,t){if(e.allDay!==t.allDay)return e.allDay?-1:1;let n=Date.parse(e.start)-Date.parse(t.start);if(n!==0)return n;let r=Date.parse(e.end)-Date.parse(t.end);return r!==0?r:e.title.localeCompare(t.title)}function ce(e,t){let n={timeZone:t,hour:"numeric",minute:"2-digit",hour12:!0};try{return new Intl.DateTimeFormat("en-US",n).format(new Date(e))}catch{return new Intl.DateTimeFormat("en-US",{...n,timeZone:void 0}).format(new Date(e))}}function je(e,t,n){let r=Ve(e.url),a=r?`[${z(e.title)}](${Be(r)})`:z(e.title),i=re(n,e.attendees).map(d=>d.markdownLink).filter(d=>!!d),s=e.allDay?"All day":`${ce(e.start,t.range.timeZone)}\u2013${ce(e.end,t.range.timeZone)}`;return`- ${a}${i.length?` \u2014 ${i.join(", ")}`:""} \u2014 ${s}`}function de(e,t,n){let r=[t],a=[...e.events].sort(qe);return a.length?r.push(...a.map(o=>je(o,e,n))):r.push("No calendar events today."),ie(r)}var N={peopleFolder:"People",sectionHeading:"## Calendar"};function v(e){if(typeof e!="string")return N.peopleFolder;let t=e.replaceAll("\\","/"),n=t.split("/");return!t||t.startsWith("/")||/^[A-Za-z]:/.test(t)||n.some(r=>r.length===0||r==="."||r===".."||r.includes("\0"))?N.peopleFolder:t}function U(e){if(typeof e!="string")return;let t=e.trim().replace(/[\r\n]+/g," ").replace(/\s+/g," ");if(!(!/^#{1,6}\s+\S/.test(t)||t.includes("<!--")||t.includes("-->")||t.includes("\0")))return t}function W(e){return U(e)??N.sectionHeading}var A=class extends Error{constructor(t){super(t==="periodic"?"Periodic Notes daily functionality is enabled. Disable it and enable the core Daily Notes plugin.":"The core Daily Notes plugin is unavailable. Enable it and try again."),this.name="DailyNotesModeError"}};function m(e){return typeof e=="object"&&e!==null}function Qe(e){try{if(!m(e))return"disabled";let t=m(e.internalPlugins)?e.internalPlugins:void 0,r=(t&&m(t.plugins)?t.plugins:void 0)?.["daily-notes"],a=m(r)&&r.enabled===!0,o=m(e.plugins)?e.plugins:void 0,s=(o&&typeof o.getPlugin=="function"?o.getPlugin.bind(o):void 0)?.("periodic-notes"),d=m(s)&&m(s.settings)?s.settings:void 0;return(d&&m(d.daily)?d.daily:void 0)?.enabled===!0?"periodic":a?"core":"disabled"}catch{return"disabled"}}function f(e){let t=Qe(e);if(t!=="core")throw new A(t)}var S=class extends Error{constructor(t){super(t),this.name="DailyNotesFolderError"}};function Ze(e){if(typeof e!="string")throw new S("The core Daily Notes folder setting is invalid.");if(e==="")return"";let t=e.replaceAll("\\","/"),n=t.split("/");if(t.startsWith("/")||t.startsWith("~")||/^[A-Za-z]:/.test(t)||n.some(r=>r.length===0||r==="."||r===".."||r.includes("\0")))throw new S("The core Daily Notes folder setting must be a safe vault-relative folder.");return t}async function ue(e,t,n){let r=Ze(t);if(!r)return;let a=r.split("/"),o="";for(let i of a){o=o?`${o}/${i}`:i;let s=e.getAbstractFileByPath(o);if(s){if(!n(s))throw new S(`Daily Notes folder path is occupied by a file: ${o}`);continue}try{await e.createFolder(o)}catch(d){let u=e.getAbstractFileByPath(o);if(u&&n(u))continue;throw d}}}var x=class extends c.Plugin{constructor(){super(...arguments);this.settings={...N}}async onload(){await this.loadSettings(),this.addCommand({id:"populate-todays-daily-note-with-calendar-events",name:"Populate today's Daily Note with Calendar events",callback:()=>{this.populateDailyNote()}}),this.addSettingTab(new B(this.app,this))}async loadSettings(){let n=await this.loadData();this.settings={peopleFolder:v(n?.peopleFolder),sectionHeading:W(n?.sectionHeading)}}async saveSettings(){this.settings.peopleFolder=v(this.settings.peopleFolder),this.settings.sectionHeading=W(this.settings.sectionHeading),await this.saveData(this.settings)}async populateDailyNote(){if(process.platform!=="darwin"){new c.Notice("Calendar Daily Note Linker requires macOS desktop and Calendar.app.");return}let n;try{n=await ee()}catch(a){let o=a instanceof h?a.message:`Calendar access failed: ${a instanceof Error?a.message:String(a)}`;new c.Notice(o,1e4);return}for(let a of n.warnings)new c.Notice(`Calendar warning: ${a}`,8e3);try{f(this.app)}catch(a){new c.Notice(a instanceof A?a.message:"Could not safely inspect Daily Notes. Enable the core Daily Notes plugin and try again.",1e4);return}let r;try{f(this.app);let a=F();if(!a)throw new Error("Daily Notes settings are unavailable.");let o=window.moment(n.targetDate,"YYYY-MM-DD",!0);if(!o.isValid())throw new Error(`Calendar target date is invalid: ${n.targetDate}`);await ue(this.app.vault,a.folder??"",s=>s instanceof c.TFolder),f(this.app);let i=I();f(this.app),r=L(o,i),r||(f(this.app),r=await Z(o),f(this.app),r||(f(this.app),i=I(),f(this.app),r=L(o,i)))}catch(a){new c.Notice(`Daily Notes could not resolve or create today's note. Check the core Daily Notes settings and enable Daily Notes. ${a instanceof Error?a.message:String(a)}`,1e4);return}if(!r){new c.Notice("Daily Notes did not provide today's note. Check that Daily Notes is enabled and configured.",1e4);return}try{let a=this.app.vault.getMarkdownFiles().map(s=>({path:s.path,basename:s.basename,file:s,frontmatter:this.app.metadataCache.getFileCache(s)?.frontmatter})),o=ae(ne(a,this.settings.peopleFolder),s=>{if(!s.file)throw new Error(`People note is unavailable: ${s.path}`);return this.app.fileManager.generateMarkdownLink(s.file,r.path,void 0,s.basename||void 0)}),i=de(n,this.settings.sectionHeading,o);f(this.app),await this.app.vault.process(r,s=>se(s,i))}catch(a){new c.Notice(`Today's Daily Note could not be updated: ${a instanceof Error?a.message:String(a)}`,1e4);return}new c.Notice("Today's Daily Note was updated with Calendar events.")}},B=class extends c.PluginSettingTab{constructor(t,n){super(t,n),this.plugin=n}display(){let{containerEl:t}=this;t.empty(),t.createEl("h2",{text:"Calendar Daily Note Linker"}),new c.Setting(t).setName("People folder").setDesc("Vault-relative folder to search recursively for Markdown People notes.").addText(n=>n.setPlaceholder(N.peopleFolder).setValue(this.plugin.settings.peopleFolder).onChange(async r=>{this.plugin.settings.peopleFolder=v(r),n.setValue(this.plugin.settings.peopleFolder),await this.plugin.saveSettings()})),new c.Setting(t).setName("Section heading").setDesc("Markdown heading used inside the managed Calendar section; saves when focus leaves the field (for example ## Calendar).").addText(n=>{n.setPlaceholder(N.sectionHeading).setValue(this.plugin.settings.sectionHeading),n.inputEl.addEventListener("blur",()=>{this.commitSectionHeading(n)})})}async commitSectionHeading(t){let n=this.plugin.settings.sectionHeading,r=U(t.getValue());if(!r){t.setValue(n),new c.Notice("Use a Markdown heading from # to ######, such as ## Calendar.");return}this.plugin.settings.sectionHeading=r,t.setValue(r);try{await this.plugin.saveSettings()}catch(a){this.plugin.settings.sectionHeading=n,t.setValue(n),new c.Notice(`Could not save the Section heading: ${a instanceof Error?a.message:String(a)}`)}}};
