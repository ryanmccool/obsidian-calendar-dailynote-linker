"use strict";var M=Object.defineProperty;var we=Object.getOwnPropertyDescriptor;var De=Object.getOwnPropertyNames;var ve=Object.prototype.hasOwnProperty;var Pe=(e,t)=>{for(var n in t)M(e,n,{get:t[n],enumerable:!0})},Ce=(e,t,n,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of De(t))!ve.call(e,r)&&r!==n&&M(e,r,{get:()=>t[r],enumerable:!(i=we(t,r))||i.enumerable});return e};var be=e=>Ce(M({},"__esModule",{value:!0}),e);var Ke={};Pe(Ke,{default:()=>$});module.exports=be(Ke);var u=require("obsidian");var G=require("node:child_process"),q=require("node:util");var d=class extends Error{constructor(t){super(t),this.name="CalendarPayloadValidationError"}};function A(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function x(e,t){if(typeof e!="string")throw new d(`${t} must be a string`);return e}function D(e,t){if(e!==null&&typeof e!="string")throw new d(`${t} must be a string or null`);return e}function E(e,t){let n=x(e,t);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(n)||Number.isNaN(Date.parse(n)))throw new d(`${t} must be a valid ISO date`);return n}function Y(e){let t=x(e,"targetDate");if(!/^\d{4}-\d{2}-\d{2}$/.test(t))throw new d("targetDate must be YYYY-MM-DD");let[n,i,r]=t.split("-").map(Number),a=new Date(Date.UTC(n,i-1,r));if(a.getUTCFullYear()!==n||a.getUTCMonth()!==i-1||a.getUTCDate()!==r)throw new d("targetDate must be a valid calendar date");return t}function Ne(e){return/^(?:Calendar attendee|Some Calendar attendee).*unavailable on this macOS\/source\.$/.test(e)}function xe(e,t){if(!A(e))throw new d(`events attendee ${t} must be an object`);return{displayName:D(e.displayName,`attendee ${t} displayName`),email:D(e.email,`attendee ${t} email`),status:D(e.status,`attendee ${t} status`)}}function ke(e,t){if(!A(e))throw new d(`event ${t} must be an object`);let n=e.attendees;if(!Array.isArray(n))throw new d(`event ${t} attendees must be an array`);let i=E(e.start,`event ${t} start`),r=E(e.end,`event ${t} end`);if(Date.parse(r)<Date.parse(i))throw new d(`event ${t} end cannot precede start`);if(typeof e.allDay!="boolean")throw new d(`event ${t} allDay must be a boolean`);return{id:D(e.id,`event ${t} id`),calendar:D(e.calendar,`event ${t} calendar`),title:x(e.title,`event ${t} title`),start:i,end:r,allDay:e.allDay,url:D(e.url,`event ${t} url`),location:D(e.location,`event ${t} location`),notes:e.notes===null?null:(()=>{throw new d(`event ${t} notes must be null`)})(),attendees:n.map((a,o)=>xe(a,o))}}function Z(e){let t;try{t=JSON.parse(e)}catch{throw new d("Calendar bridge output was not valid JSON")}return Ae(t)}function Ae(e){if(!A(e))throw new d("Calendar bridge output must be a JSON object");if(e.schemaVersion!==1)throw new d("Calendar bridge output has an unsupported schema version");if(!A(e.range))throw new d("Calendar bridge output range must be an object");let t=E(e.range.start,"range start"),n=E(e.range.end,"range end");if(Date.parse(n)<=Date.parse(t))throw new d("range end must be after range start");let i=x(e.range.timeZone,"range timeZone").trim();if(!i)throw new d("range timeZone cannot be empty");if(!Array.isArray(e.events))throw new d("Calendar bridge output events must be an array");if(!Array.isArray(e.warnings)||e.warnings.some(a=>typeof a!="string"))throw new d("Calendar bridge output warnings must be an array of strings");let r=e.warnings;return{schemaVersion:1,source:x(e.source,"source"),targetDate:Y(e.targetDate),range:{start:t,end:n,timeZone:i},events:e.events.map((a,o)=>ke(a,o)),warnings:r.map(a=>{if(!Ne(a))throw new d("Calendar bridge warnings may only describe unavailable attendee properties");return a})}}var J=`/*
 * Fixed JXA bridge for Calendar.app.
 * JXA invokes run(argv); its return value is the only stdout produced by this script.
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

function main() {
  var Calendar = Application("Calendar");
  var warnings = [];
  var targetDate = arguments.length === 1 ? String(arguments[0]) : "";
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(targetDate)) throw new Error("Calendar target date must be YYYY-MM-DD.");
  var dateParts = targetDate.split("-").map(Number);
  var year = dateParts[0];
  var month = dateParts[1];
  var day = dateParts[2];
  var rangeStart = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (rangeStart.getFullYear() !== year || rangeStart.getMonth() !== month - 1 || rangeStart.getDate() !== day) {
    throw new Error("Calendar target date must be a valid local date.");
  }
  var rangeEnd = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  var timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  var events = [];

  var calendars = Calendar.calendars();
  if (!Array.isArray(calendars)) throw new Error("Calendar calendars could not be enumerated.");
  for (var calendarIndex = 0; calendarIndex < calendars.length; calendarIndex += 1) {
    var calendar = calendars[calendarIndex];
    var calendarName = stringOrNull(readEventProperty(calendar, "name"));
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
        calendar: calendarName,
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

function run(argv) {
  if (!argv || argv.length !== 1) throw new Error("Calendar target date argument is required.");
  return main.apply(null, argv);
}
`;var Ee=(0,q.promisify)(G.execFile),Te=async(e,t,n)=>await Ee(e,t,n),w=class extends Error{constructor(t){super(t),this.name="CalendarBridgeError"}};async function X(e,t=Te){try{Y(e)}catch(r){throw new w(r instanceof Error?r.message:"Calendar target date must be YYYY-MM-DD.")}let n;try{n=await t("/usr/bin/osascript",["-l","JavaScript","-e",J,e],{encoding:"utf8",timeout:3e4,maxBuffer:2*1024*1024,shell:!1,windowsHide:!0})}catch(r){let a=r instanceof Error?r.message:String(r);throw new w("Calendar access failed. Allow Obsidian to control Calendar in System Settings > Privacy & Security > Automation, then try again. "+a)}let i=n.stdout.trim();if(!i){let r=n.stderr.trim();throw new w(`Calendar bridge returned no data. Check Calendar and Automation permissions${r?`: ${r}`:"."}`)}try{let r=Z(i);if(r.targetDate!==e)throw new Error(`Calendar bridge returned ${r.targetDate} instead of ${e}.`);return r}catch(r){let a=r instanceof Error?r.message:String(r);throw new w(`Calendar bridge returned malformed data: ${a}`)}}function R(e,t,n){if(!t)return;let i=e.get(t)??[];i.some(r=>r.path===n.path)||(i.push(n),i.sort((r,a)=>r.path.localeCompare(a.path))),e.set(t,i)}function T(e){return e.normalize("NFKC").trim().replace(/\s+/gu," ").toLowerCase()}function Q(e){return e.normalize("NFKC").trim().replace(/\s+/gu,"").toLowerCase()}function L(e,t){let n=e?.[t];return typeof n=="string"?[n]:Array.isArray(n)?n.filter(i=>typeof i=="string"):[]}function Se(e){let t=e.path.replaceAll("\\","/"),n=e.basename||t.split("/").at(-1)?.replace(/\.md$/i,"")||"";return{path:t,basename:n,file:e.file}}function $e(e,t){let n=e.replaceAll("\\","/");return t.some(i=>{let r=i.replaceAll("\\","/").replace(/\/+$/u,"");return n===r||n.startsWith(`${r}/`)})}function ee(e,t){let n=new Map,i=new Map;for(let r of e){let a=r.path.replaceAll("\\","/");if(!a.toLowerCase().endsWith(".md")||$e(a,t))continue;let o=Se(r);R(i,T(o.basename),o);for(let s of L(r.frontmatter,"aliases"))R(i,T(s),o);for(let s of[...L(r.frontmatter,"email"),...L(r.frontmatter,"emails")])R(n,Q(s),o)}return{byEmail:n,byName:i}}function Fe(e,t){let n=t.email?Q(t.email):"";if(n){let a=e.byEmail.get(n);if(a?.length===1)return a[0];if(a&&a.length>1)return null}let i=t.displayName?T(t.displayName):"";if(!i)return null;let r=e.byName.get(i);return r?.length===1?r[0]:null}function Ve(e,t){let n=[];for(let i of t){let r=Fe(e,i);r&&!n.some(a=>a.path===r.path)&&n.push(r)}return n}function te(e,t,n){let i=Ve(e,t);if(i.length>0)return i;let r=e.byName.get(T(n));return r?.length===1?[r[0]]:[]}function ne(e,t){let n=new Map,i=r=>r.map(a=>{let o=n.get(a.path);return o===void 0&&(o=t(a),n.set(a.path,o)),{...a,markdownLink:o}});return{byEmail:new Map([...e.byEmail].map(([r,a])=>[r,i(a)])),byName:new Map([...e.byName].map(([r,a])=>[r,i(a)]))}}var v="<!-- calendar-daily-note-linker:start -->",P="<!-- calendar-daily-note-linker:end -->",C=class extends Error{constructor(t){super(t),this.name="CalendarBlockError"}};function ie(e){return[v,...e.map(oe),P].join(`
`)}function ae(e,t){Ie(t);let n=[],i=[],r=e.split(`
`);if(r.forEach((s,l)=>{let p=s.endsWith("\r")?s.slice(0,-1):s,m=p===v,h=p===P;if(m&&n.push(l),h&&i.push(l),(p.includes(v)||p.includes(P))&&!m&&!h)throw new C("The Calendar section marker must be on an exact standalone line.")}),n.length===0&&i.length===0)return Me(e,t);if(n.length!==1||i.length!==1||n[0]>=i[0])throw new C("The Calendar section markers are duplicated, incomplete, or out of order.");let a=re(r,n[0]),o=re(r,i[0]+1);return`${e.slice(0,a)}${t}${e.slice(o)}`}function Ie(e){let t=e.split(`
`).map(n=>n.endsWith("\r")?n.slice(0,-1):n);if(t[0]!==v||t[t.length-1]!==P)throw new C("Generated Calendar content has invalid section markers.");if(t.slice(1,-1).some(n=>n.includes(v)||n.includes(P)))throw new C("Generated Calendar content contains a section marker literal.")}function oe(e){return e.replace(/\r\n?|\n|\u2028|\u2029/gu," ").replace(/[\u0000-\u001f\u007f-\u009f]/gu,"").replaceAll(v,"[calendar section start]").replaceAll(P,"[calendar section end]")}function _(e){return oe(e).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replace(/[\\`*_{}\[\]()#+\-.!|>~]/gu,"\\$&")}function Me(e,t){let n=e.length>0&&!e.endsWith(`
`)?`
`:"";return`${e}${n}${t}
`}function re(e,t){let n=0;for(let i=0;i<t&&i<e.length;i+=1)n+=e[i].length+1;return n}function Ye(e){return e.replaceAll("\\","\\\\").replace(/[\s<>]/gu,t=>encodeURIComponent(t)).replaceAll("(","\\(").replaceAll(")","\\)").replaceAll('"',"%22")}function Re(e){if(!e?.trim()||/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(e)||e.includes("<!-- calendar-daily-note-linker:start -->")||e.includes("<!-- calendar-daily-note-linker:end -->"))return null;try{let t=new URL(e.trim());return t.protocol==="http:"||t.protocol==="https:"?t.href:null}catch{return null}}function Le(e,t){if(e.allDay!==t.allDay)return e.allDay?-1:1;let n=Date.parse(e.start)-Date.parse(t.start);if(n!==0)return n;let i=Date.parse(e.end)-Date.parse(t.end);return i!==0?i:e.title.localeCompare(t.title)}function se(e,t){let n={timeZone:t,hour:"numeric",minute:"2-digit",hour12:!0};try{return new Intl.DateTimeFormat("en-US",n).format(new Date(e))}catch{return new Intl.DateTimeFormat("en-US",{...n,timeZone:void 0}).format(new Date(e))}}function _e(e,t,n){let i=Re(e.url),r=i?`[${_(e.title)}](${Ye(i)})`:_(e.title),o=te(n,e.attendees,e.title).map(l=>l.markdownLink).filter(l=>!!l),s=e.allDay?"All day":`${se(e.start,t.range.timeZone)}\u2013${se(e.end,t.range.timeZone)}`;return{line:`- ${r}${o.length?` \u2014 ${o.join(", ")}`:""} \u2014 ${s}`,linkCount:o.length}}function le(e,t,n){let i=[t],r=[...e.events].sort(Le),a=0;if(!r.length)i.push(`No Calendar events found for ${e.targetDate}.`);else for(let o of r){let s=_e(o,e,n);i.push(s.line),a+=s.linkCount}return{block:ie(i),eventCount:r.length,linkCount:a}}var k={excludedVaultFolders:[],sectionHeading:"## Calendar"},z=class extends Error{constructor(){super("Vault folder exclusions are malformed. Correct them in settings before importing Calendar events."),this.name="ExcludedVaultFolderError"}};function ze(e){let t=e.replaceAll("\\","/"),n=t.split("/");if(!(!t||t.startsWith("/")||/^[A-Za-z]:/.test(t)||n.some(i=>i.length===0||i==="."||i===".."||i.includes("\0"))))return t}function S(e){let t=Array.isArray(e),n=typeof e=="string"?e.split(/\r\n?|\n|\u2028|\u2029/gu):t&&e.every(r=>typeof r=="string")?e:void 0;if(!n)return;let i=[];for(let r of n){if(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(r))return;if(!r.trim())continue;let a=ze(r);if(!a)return;i.includes(a)||i.push(a)}return i}function de(e){if(e===void 0)return k.excludedVaultFolders;let t=S(e);if(!t)throw new z;return t}function ce(e){if(e===void 0)return{folders:[],malformed:!1};let t=S(e);return t?{folders:t,malformed:!1}:{folders:[],malformed:!0,rawInput:typeof e=="string"?e:Array.isArray(e)?e.map(String).join(`
`):String(e)}}function O(e){if(typeof e!="string")return;let t=e.trim().replace(/[\r\n]+/g," ").replace(/\s+/g," ");if(!(!/^#{1,6}\s+\S/.test(t)||t.includes("<!--")||t.includes("-->")||t.includes("\0")))return t}function U(e){return O(e)??k.sectionHeading}var c=class extends Error{constructor(t){super(t),this.name="ActiveDailyNoteError"}};function Oe(e){return(e??"").replaceAll("\\","/").replace(/\/+$/u,"")}function Ue(e){let t=[],n=0;for(;n<e.length;){if(e[n]==="\\"){n+=2;continue}if(e[n]==="["){let i=e.indexOf("]",n+1);n=i===-1?e.length:i+1;continue}if(/[YMD]/u.test(e[n])){let i=n,r=e[n];for(;n<e.length&&e[n]===r&&n-i<5;)n+=1;t.push({token:e.slice(i,n),start:i,end:n});continue}n+=1}return t}function He(e){if(typeof e!="string"||!e)return!1;let t=Ue(e),n=t.filter(({token:s})=>s.startsWith("D")),i=n.some(({token:s})=>s.length>=3),r=n.some(({token:s})=>s.length<=2),a=t.some(({token:s})=>s.startsWith("M"));return!t.some(({token:s})=>s.startsWith("Y"))||!(i||a&&r)?!1:t.some(({token:s})=>s==="YYYY")}function je(e,t){let n=e.replaceAll("\\","/"),i=t?`${t}/`:"";if(t&&!n.startsWith(i))throw new c("The active note is outside the configured core Daily Notes folder.");let r=n.slice(i.length);if(!r.endsWith(".md"))throw new c("The active note must be a Markdown Daily Note.");return r.slice(0,-3)}function ue(e,t,n,i,r){if(e.extension.toLowerCase()!=="md")throw new c("Open an existing configured Daily Note before running this command.");if(!He(t.format))throw new c("The core Daily Notes filename format cannot identify one calendar date.");let a=Oe(t.folder),o=t.format,s=je(e.path,a),l=n(s,o,!0);if(!l?.isValid()||l.format(o)!==s){if(!r)throw new c("The active note path is not the canonical core Daily Note for one date.");let h=n(s,o,!1);if(!h?.isValid())throw new c("The active note path is not the canonical core Daily Note for one date.");let N=pe(s,o,h.format("YYYY-MM-DD"),r);if(N.length!==1)throw new c("The active note path can represent more than one calendar date.");l=N[0]}let p=`${a?`${a}/`:""}${l.format(o)}.md`;if(e.path.replaceAll("\\","/")!==p)throw new c("The active note path is not the canonical core Daily Note path.");if(!r||Be(s,o,l,r))throw new c("The active note path can represent more than one calendar date.");if(i&&!o.includes("/")){let h=i(e,"day");if(h?.isValid()&&h.format("YYYY-MM-DD")!==l.format("YYYY-MM-DD"))throw new c("The active note date could not be confirmed by core Daily Notes.")}let m=l.format("YYYY-MM-DD");if(!/^\d{4}-\d{2}-\d{2}$/u.test(m))throw new c("The active note did not resolve to one calendar date.");return m}function We(e,t){let n=new Date(Date.UTC(e,0,1+t));return`${String(n.getUTCFullYear()).padStart(4,"0")}-${String(n.getUTCMonth()+1).padStart(2,"0")}-${String(n.getUTCDate()).padStart(2,"0")}`}function pe(e,t,n,i){let r=Number(n.slice(0,4)),a=[],o=[r-100,r-1,r,r+1,r+100];for(let s of o){let l=new Date(Date.UTC(s,1,29)).getUTCDate()===29?366:365;for(let p=0;p<l;p+=1){let m=i(We(s,p));m?.isValid()&&m.format(t)===e&&a.push(m)}}return a}function Be(e,t,n,i){let r=n.format("YYYY-MM-DD");return pe(e,t,r,i).some(o=>o.format("YYYY-MM-DD")!==r)}function ge(e,t,n,i,r,a){if(!t||t!==e||t.path!==e.path||t.basename!==e.basename)throw new c("The active Daily Note changed, moved, or was deleted; import aborted before writing.");if((n.folder??"")!==(i.folder??"")||(n.format??"")!==(i.format??"")||(n.template??"")!==(i.template??"")||r!==a)throw new c("The active Daily Note or core Daily Notes configuration changed; import aborted before writing.")}function me(e,t,n,i){if(n===0)return`No Calendar events found for ${e}. The active Daily Note was updated.`;let r=n===1?"event":"events";return i===0?`Imported ${n} Calendar ${r} into ${t}. No attendees or event titles uniquely matched vault notes.`:`Imported ${n} Calendar ${r} into ${t} and added ${i} vault ${i===1?"link":"links"}.`}var f=class extends Error{constructor(t,n){super(n),this.name="DailyNoteProviderCompatibilityError",this.kind=t}},b=class extends Error{constructor(t){super(t),this.name="DailyNoteProviderError"}};function y(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function H(e,t,n,i){let r=e[t];if(r===void 0)return n;if(typeof r!="string")throw new f(i,`${i==="core"?"Core Daily Notes":"Periodic Notes"} ${t} setting has an unsupported shape.`);return t==="format"&&r.trim()===""?n:t==="folder"||t==="template"?r.trim():r}function fe(e,t){return{folder:H(e,"folder","",t),format:H(e,"format","YYYY-MM-DD",t),template:H(e,"template","",t)}}function j(e){if(!y(e))return{candidates:[],errors:[new f("core","Core Daily Notes provider shape is unavailable.")]};let t=[],n=[];try{let r=(y(e.internalPlugins)&&y(e.internalPlugins.plugins)?e.internalPlugins.plugins:void 0)?.["daily-notes"];if(y(r)&&r.enabled===!0)if(!y(r.instance)||!y(r.instance.options))n.push(new f("core","Core Daily Notes settings/options are unavailable or unsupported."));else try{t.push({kind:"core",settings:fe(r.instance.options,"core")})}catch(a){a instanceof f?n.push(a):n.push(new f("core","Core Daily Notes settings could not be read safely."))}}catch{n.push(new f("core","Core Daily Notes provider shape is unavailable or unsupported."))}try{let i=y(e.plugins)?e.plugins:void 0,r=i&&typeof i.getPlugin=="function"?i.getPlugin.bind(i):void 0;if(!r)return{candidates:t,errors:[...n,new f("periodic","Periodic Notes provider shape is unavailable or unsupported.")]};let a=r?.("periodic-notes");if(a!==void 0){if(!y(a)||!y(a.settings)||!y(a.settings.daily))n.push(new f("periodic","Periodic Notes daily settings are unavailable or unsupported."));else if(a.settings.daily.enabled===!0)try{t.push({kind:"periodic",settings:fe(a.settings.daily,"periodic")})}catch(o){o instanceof f?n.push(o):n.push(new f("periodic","Periodic Notes daily settings could not be read safely."))}}}catch{n.push(new f("periodic","Periodic Notes provider shape is unavailable or unsupported."))}return{candidates:t,errors:n}}function W(e,t,n,i,r=[]){let a=[];for(let s of t)try{let l=ue(e,s.settings,n,void 0,i);a.push({...s,targetDate:l})}catch{}if(!a.length){let s=r.length?` ${r.map(l=>l.message).join(" ")}`:"";throw new b(`The active note does not match configured Daily Notes or Periodic Notes settings.${s} Open a configured Daily Note or check those settings.`)}if(new Set(a.map(s=>s.targetDate)).size>1)throw new b("The active note matches multiple Daily Notes configurations with different dates; import is ambiguous.");return a.find(s=>s.kind==="core")??a[0]}function he(e,t){if(e.kind!==t.kind||e.targetDate!==t.targetDate||(e.settings.folder??"")!==(t.settings.folder??"")||(e.settings.format??"")!==(t.settings.format??"")||(e.settings.template??"")!==(t.settings.template??""))throw new c("The Daily Note provider or configuration changed; import aborted before writing.")}var $=class extends u.Plugin{constructor(){super(...arguments);this.settings={...k};this.excludedVaultFoldersPersistedInvalid=!1}async onload(){await this.loadSettings(),this.addCommand({id:"import-calendar-events-into-active-daily-note",name:"Import Calendar events into active Daily Note",callback:()=>{this.importIntoActiveDailyNote()}}),this.addSettingTab(new B(this.app,this))}async loadSettings(){let n=await this.loadData(),i=ce(n?.excludedVaultFolders);this.excludedVaultFoldersPersistedInvalid=i.malformed,this.excludedVaultFoldersInput=i.rawInput,this.settings={excludedVaultFolders:i.folders,sectionHeading:U(n?.sectionHeading)}}async saveSettings(){this.settings.excludedVaultFolders=de(this.settings.excludedVaultFolders),this.settings.sectionHeading=U(this.settings.sectionHeading);let n=this.excludedVaultFoldersPersistedInvalid?{...this.settings,excludedVaultFolders:this.excludedVaultFoldersInput??""}:this.settings;await this.saveData(n)}async importIntoActiveDailyNote(){let n=new u.Notice("Checking the active Daily Note\u2026",0),i=r=>{n.setMessage(r),window.setTimeout(()=>n.hide(),1e4)};try{if(process.platform!=="darwin")throw new Error("Calendar Daily Note Linker requires macOS desktop and Calendar.app.");let r=this.app.workspace.getActiveFile();if(!r||r.extension.toLowerCase()!=="md")throw new c("Open an existing configured Daily Note before running this command.");if(this.excludedVaultFoldersPersistedInvalid)throw new Error("Saved vault folder exclusions are invalid. Correct them in settings before importing Calendar events.");let a=(g,ye)=>(0,u.moment)(g,ye,!0),o=g=>(0,u.moment)(g,"YYYY-MM-DD",!0),s=j(this.app),l=W(r,s.candidates,a,o,s.errors),p=l.targetDate;n.setMessage(`Reading Calendar for ${p}\u2026`);let m=await X(p);m.warnings.length&&new u.Notice(`Calendar warning: ${m.warnings.join(" ")}`,8e3),n.setMessage("Matching vault notes\u2026");let h=this.app.vault.getMarkdownFiles().map(g=>({path:g.path,basename:g.basename,file:g,frontmatter:this.app.metadataCache.getFileCache(g)?.frontmatter})),N=ne(ee(h,this.settings.excludedVaultFolders),g=>{if(!g.file)throw new Error(`Vault note is unavailable: ${g.path}`);return this.app.fileManager.generateMarkdownLink(g.file,r.path,void 0,g.basename||void 0)}),F=le(m,this.settings.sectionHeading,N);n.setMessage("Writing the active Daily Note\u2026");let V=this.app.workspace.getActiveFile();if(!V||this.app.vault.getAbstractFileByPath(r.path)!==r)throw new c("The active Daily Note changed, moved, or was deleted; import aborted before writing.");let K=j(this.app),I=W(V,K.candidates,a,o,K.errors);ge(r,V,l.settings,I.settings,p,I.targetDate),he(l,I),await this.app.vault.process(r,g=>ae(g,F.block)),i(me(p,r.basename,F.eventCount,F.linkCount))}catch(r){let a=r instanceof w||r instanceof b||r instanceof c?r.message:`Could not import Calendar events: ${r instanceof Error?r.message:String(r)}`;i(a)}}},B=class extends u.PluginSettingTab{constructor(t,n){super(t,n),this.plugin=n}display(){let{containerEl:t}=this;t.empty(),t.createEl("h2",{text:"Calendar Daily Note Linker"}),this.plugin.excludedVaultFoldersPersistedInvalid&&t.createEl("p",{text:"Saved vault folder exclusions are invalid; correct them before importing Calendar events."}),new u.Setting(t).setName("Vault folders to exclude").setDesc("Optional vault-relative folders to skip when matching Calendar attendees; one path per line; exclusions include subfolders; blank searches all Markdown notes.").addTextArea(n=>{n.setPlaceholder(`Archive
Templates
Private/People`).setValue(this.plugin.excludedVaultFoldersInput??this.plugin.settings.excludedVaultFolders.join(`
`)),n.inputEl.addEventListener("blur",()=>{this.commitExcludedVaultFolders(n)})}),new u.Setting(t).setName("Section heading").setDesc("Markdown heading used inside the managed Calendar section; saves when focus leaves the field (for example ## Calendar).").addText(n=>{n.setPlaceholder(k.sectionHeading).setValue(this.plugin.settings.sectionHeading),n.inputEl.addEventListener("blur",()=>{this.commitSectionHeading(n)})}),t.createEl("p",{text:"Open an existing configured Daily Note, then run the command; it updates that open note for its date."})}async commitSectionHeading(t){let n=this.plugin.settings.sectionHeading,i=O(t.getValue());if(!i){t.setValue(n),new u.Notice("Use a Markdown heading from # to ######, such as ## Calendar.");return}this.plugin.settings.sectionHeading=i,t.setValue(i);try{await this.plugin.saveSettings()}catch(r){this.plugin.settings.sectionHeading=n,t.setValue(n),new u.Notice(`Could not save the Section heading: ${r instanceof Error?r.message:String(r)}`)}}async commitExcludedVaultFolders(t){let n=[...this.plugin.settings.excludedVaultFolders],i=this.plugin.excludedVaultFoldersPersistedInvalid,r=this.plugin.excludedVaultFoldersInput,a=S(t.getValue());if(!a){this.plugin.excludedVaultFoldersPersistedInvalid||t.setValue(n.join(`
`)),new u.Notice("Use one safe vault-relative folder per line, or leave the field blank.");return}this.plugin.settings.excludedVaultFolders=a,this.plugin.excludedVaultFoldersPersistedInvalid=!1,this.plugin.excludedVaultFoldersInput=void 0,t.setValue(a.join(`
`));try{await this.plugin.saveSettings()}catch(o){this.plugin.settings.excludedVaultFolders=n,this.plugin.excludedVaultFoldersPersistedInvalid=i,this.plugin.excludedVaultFoldersInput=r,t.setValue(i?r??"":n.join(`
`)),new u.Notice(`Could not save excluded folders: ${o instanceof Error?o.message:String(o)}`)}}};
