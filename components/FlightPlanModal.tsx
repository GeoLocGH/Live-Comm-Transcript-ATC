
import React, { useState } from 'react';
import { FlightPlan } from '../types';
import PlaneIcon from './icons/PlaneIcon';

interface FlightPlanModalProps {
  onGenerate: (flightPlan: FlightPlan) => void;
  onClose: () => void;
  isGenerating: boolean;
}

const FlightPlanModal: React.FC<FlightPlanModalProps> = ({ onGenerate, onClose, isGenerating }) => {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [route, setRoute] = useState('');
  const [aircraftType, setAircraftType] = useState('');
  const [cruisingAltitude, setCruisingAltitude] = useState('');
  const [flightRules, setFlightRules] = useState<'VFR' | 'IFR'>('IFR');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate({
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      route,
      aircraftType: aircraftType.toUpperCase(),
      cruisingAltitude: cruisingAltitude.toUpperCase(),
      flightRules
    });
  };

  return (
    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-lg shadow-2xl border border-gray-700 flex flex-col">
        <header className="flex justify-between items-center p-4 border-b border-gray-700">
          <div className="flex items-center space-x-2">
            <PlaneIcon className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-bold text-white">New Flight Plan</h2>
          </div>
          <button onClick={onClose} disabled={isGenerating} className="text-gray-500 hover:text-white text-2xl" title="Close">&times;</button>
        </header>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Origin (ICAO)</label>
              <input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="e.g. KBOS" required maxLength={4} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Destination (ICAO)</label>
              <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="e.g. KJFK" required maxLength={4} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Route</label>
            <input value={route} onChange={e => setRoute(e.target.value)} placeholder="e.g. LUCOS SEY PARCH3" className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            <p className="text-xs text-gray-500 mt-1">Leave blank for "As Filed"</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Aircraft Type</label>
              <input value={aircraftType} onChange={e => setAircraftType(e.target.value)} placeholder="e.g. C172" required className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Cruising Altitude</label>
              <input value={cruisingAltitude} onChange={e => setCruisingAltitude(e.target.value)} placeholder="e.g. 5000 or FL320" required className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-300 mb-2">Flight Rules</label>
             <div className="flex space-x-4">
               <label className="flex items-center space-x-2 cursor-pointer">
                 <input type="radio" checked={flightRules === 'IFR'} onChange={() => setFlightRules('IFR')} className="text-cyan-500 focus:ring-cyan-500" />
                 <span className="text-gray-300">IFR</span>
               </label>
               <label className="flex items-center space-x-2 cursor-pointer">
                 <input type="radio" checked={flightRules === 'VFR'} onChange={() => setFlightRules('VFR')} className="text-cyan-500 focus:ring-cyan-500" />
                 <span className="text-gray-300">VFR</span>
               </label>
             </div>
          </div>

          <div className="flex justify-end pt-4">
            <button 
              type="submit" 
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-md transition-colors text-white font-semibold"
            >
              {isGenerating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating...
                  </>
              ) : (
                  <>
                    <PlaneIcon className="w-5 h-5" />
                    Generate Scenario
                  </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FlightPlanModal;
