/* Display labels for quick manual market lookup. Not an official Superbet taxonomy. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.EdgeMarketLabels=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const dict=Object.freeze({
 "1x2_home":{group:"Wynik meczu",selection:"1",search:"Wynik meczu"},
 "1x2_draw":{group:"Wynik meczu",selection:"X",search:"Wynik meczu"},
 "1x2_away":{group:"Wynik meczu",selection:"2",search:"Wynik meczu"},
 "dc_1x":{group:"Podwójna szansa",selection:"1X",search:"Podwójna szansa"},
 "dc_x2":{group:"Podwójna szansa",selection:"X2",search:"Podwójna szansa"},
 "dc_12":{group:"Podwójna szansa",selection:"12",search:"Podwójna szansa"},
 "btts_yes":{group:"Obie drużyny strzelą gola",selection:"Tak",search:"Obie drużyny strzelą"},
 "btts_no":{group:"Obie drużyny strzelą gola",selection:"Nie",search:"Obie drużyny strzelą"},
 "total_over_15":{group:"Suma goli",selection:"Powyżej 1,5",search:"Suma goli"},
 "total_over_25":{group:"Suma goli",selection:"Powyżej 2,5",search:"Suma goli"},
 "total_under_35":{group:"Suma goli",selection:"Poniżej 3,5",search:"Suma goli"},
 "corners_over_85":{group:"Suma rzutów rożnych",selection:"Powyżej 8,5",search:"Rzuty rożne"},
 "goal_both_halves_yes":{group:"Gol w obu połowach",selection:"Tak",search:"Gol w obu połowach"}
});
function label(id){const x=dict[id];return x?{...x,display:x.group+": "+x.selection}:null;}
const paths=Object.freeze({
 "1x2_home":["Wynik meczu","1"],"1x2_draw":["Wynik meczu","X"],"1x2_away":["Wynik meczu","2"],
 "dc_1x":["Podwójna szansa","1X"],"dc_x2":["Podwójna szansa","X2"],"dc_12":["Podwójna szansa","12"],
 "btts_yes":["Gole","Obie drużyny strzelą gola","Tak"],"btts_no":["Gole","Obie drużyny strzelą gola","Nie"],
 "total_over_15":["Gole","Suma goli","Powyżej 1,5"],"total_over_25":["Gole","Suma goli","Powyżej 2,5"],"total_under_35":["Gole","Suma goli","Poniżej 3,5"],
 "corners_over_85":["Rzuty rożne","Suma rzutów rożnych","Powyżej 8,5"],
 "goal_both_halves_yes":["Gole","Gol w obu połowach","Tak"]
});
function navigation(id,mode="standard"){const parts=paths[id];return parts?{parts:[...(mode==="builder"?["Bet Builder"]:[]),...parts],display:[...(mode==="builder"?["Bet Builder"]:[]),...parts].join(" → "),verified:false}:null;}
function builder(ids){if(!Array.isArray(ids)||!ids.length)return null;const parts=ids.map(label);return parts.some(x=>!x)?null:{display:parts.map(x=>x.display).join(" + "),parts};}
return Object.freeze({label,builder,navigation});
});
