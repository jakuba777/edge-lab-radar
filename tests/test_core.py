import unittest, pathlib, subprocess, json
ROOT=pathlib.Path(__file__).resolve().parents[1]

class AppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        js=ROOT/'site/assets/app.js'
        program = r'''
const v=require(process.argv[1]);
const results={};
results.quoted=v.parseCSV('date,home,away,ft_home,ft_away\n2026-10-15,"A, Club",B,2,1\n')[0].home;
results.grid=v.makeGrid(1.4,1.2).reduce((s,a)=>s+a.p,0);
results.noxss=v.safe('<script>alert(1)</script>');
results.event=v.model({date:'2026-10-28',home:'A',away:'B'},[]);
const hist=[];
for(let i=1;i<=8;i++){hist.push({date:'2026-09-'+String(i).padStart(2,'0'),home:'A',away:'Z',hs:1,as:0});hist.push({date:'2026-09-'+String(i).padStart(2,'0'),home:'Y',away:'B',hs:0,as:1});}
results.model=v.model({date:'2026-10-28',home:'A',away:'B'},hist);
results.future=v.model({date:'2026-08-01',home:'A',away:'B'},hist);
results.both=v.probability(results.model.grid,(h,a)=>h+a>=2&&h>0);
console.log(JSON.stringify(results));
'''
        p=subprocess.run(['node','-e',program,str(js)],capture_output=True,text=True,check=True)
        cls.data=json.loads(p.stdout)
    def test_grid(self): self.assertAlmostEqual(self.data['grid'],1.0,places=7)
    def test_short_history(self): self.assertFalse(self.data['event']['ok'])
    def test_no_future_data(self): self.assertFalse(self.data['future']['ok'])
    def test_joint_probability(self): self.assertTrue(0<self.data['both']<1)
    def test_history_model(self):
        self.assertTrue(self.data['model']['ok'])
        self.assertEqual(self.data['model']['nH'],8)
        self.assertEqual(self.data['model']['nA'],8)
    def test_escape(self): self.assertNotIn('<script>',self.data['noxss'])
    def test_quoted_csv(self): self.assertEqual(self.data['quoted'],'A, Club')
    def test_browser_data_same_origin(self):
        script=(ROOT/'site/assets/app.js').read_text()
        self.assertNotIn('raw.githubusercontent.com',script)
        self.assertIn("mode:'same-origin'",script)
        self.assertIn("connect-src 'self'", (ROOT/'site/index.html').read_text())
if __name__ == '__main__': unittest.main()
